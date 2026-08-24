#!/usr/bin/env node
// Machine check for the MECHANICALLY-CHECKABLE subset of the rules in
// diagram-rules.md, run against a rendered `final.svg`, plus (optionally)
// a set of CROSS-LAYER checks that read the other artifacts an example
// carries alongside its SVG — model.yaml, view.yaml, census.yaml,
// layout.json — and check that they agree with each other and with the
// rendered SVG. See "Cross-layer checks" below for those four.
//
// This is a heuristic linter, not a renderer: the SVG itself is parsed
// with a small hand-rolled tag tokenizer (no xmldom/DOMParser — node:fs
// only for that part) and can only see what's literally written in the
// markup. Rules that depend on how the file actually paints pixels
// (arrow directionality, whitespace around boxes, text overlap, …) are
// NOT evaluated here — they are always reported as
// NOT-CHECKABLE (render-dependent) so the report stays honest about what
// it did and did not verify. See diagram-rules.md for the full rule text.
// The cross-layer inputs (model.yaml/view.yaml/census.yaml, all YAML;
// layout.json) are parsed with the `yaml` package, an existing project
// dependency (see src/validate.ts) — not a new one.
//
// Checked rules (see individual check* functions below for the exact
// heuristic + its known limits):
//   rule 4    - no marker-ended <path> using C/S bezier commands (Q/A are
//               allowed as of rule 3a — a corner-rounding arc is not a
//               smooth-routed bezier)
//   rule 3a   - every 90° bend in an orthogonal connector uses ONE uniform
//               small arc radius, once any connector in the file adopts
//               rounded corners (a diagram still fully sharp-cornered is
//               WARN, not FAIL — the rule postdates it). A bend whose
//               reconstructed original adjacent segment is under 2x the
//               uniform radius may clamp to a smaller radius (rule 3a's
//               clamp clause, added 2026-08-24 alongside removing the
//               reproduce-mode exemption — rounding is now normative in
//               BOTH conversion modes); a smaller radius with no such
//               short-segment justification still FAILs
//   rule 7    - every <marker> uses markerUnits="userSpaceOnUse" and one
//               shared markerWidth/markerHeight
//   rule 8    - every connector (<polyline>/<line>) shares one stroke-width
//   rule 9    - each marker's refX lands on its arrowhead shape's tip
//   rule 10   - any stroke-dasharray usage is documented in a comment
//   C1        - a palette comment exists and covers every used fill/stroke hex
//   B4        - leaf/node rect borders share one stroke-width (containers,
//               found by geometric containment, are a separate documented class)
//   B2-lite   - vertical gaps between stacked sibling leaf rects have <=2
//               distinct values (reported, not asserted as ground truth)
//   T2-lite   - a node-label <text> anchor falls inside its paired leaf rect
//
// Everything else in diagram-rules.md is reported as NOT-CHECKABLE, either
// because it is inherently render-dependent (rules 1-3,5,6,11,12,T1,B3,B5-B10)
// or because it needs semantic judgement this tool has no way to form from
// markup alone (B1, B2, C2-C5, T3 — left as future work, not silently
// skipped).
//
// Cross-layer checks (run only when their required --flags are supplied;
// see USAGE below for the exact requirements and the DIRECTION_GEOMETRY_
// CONFLICT threshold):
//   UNKNOWN_ICON_SYMBOL              every icon id view.yaml references has
//                                    a matching <symbol id="icon-<id>"> in
//                                    the SVG defs (id maps "." -> "-"); an
//                                    unreferenced symbol is WARN, not FAIL.
//   UNTRACEABLE_VISUAL /
//   MISSING_COMPONENT                every model.yaml component id appears
//                                    exactly once via data-component in the
//                                    SVG, and vice versa (plus
//                                    data-view-element <-> view.yaml
//                                    visualElements, when --view given).
//   DIRECTION_GEOMETRY_CONFLICT      view.yaml's flow.direction vs. the net
//                                    displacement (layout.json node centers)
//                                    of each model.yaml relationship.
//   CENSUS_MISMATCH                  census.yaml's record count vs. its
//                                    source file's element count -- mxCell
//                                    vertices/edges for a .xml source.xml,
//                                    or flowchart/C4 nodes+edges for a .mmd
//                                    source.mmd (see parseMermaidSourceElements
//                                    below) -- target-id resolvability, and
//                                    drop reasons.
//   RELATIONSHIP_ATTACHMENT_NOT_RENDERED
//                                    every relationship attachment view.yaml
//                                    declares (e.g. the SSL padlock badges)
//                                    must resolve to a <use> for its icon
//                                    symbol inside the element group carrying
//                                    the matching data-relationship="<id>"
//                                    attribute — the edge-attachment
//                                    counterpart of VIEW_REF_UNRESOLVED's
//                                    component-side ATTACHMENT_NOT_RENDERED.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const RENDER_DEPENDENT_IDS = [
  '1',
  '2',
  '3',
  '5',
  '6',
  '11',
  '12',
  'T1',
  'B3',
  'B5',
  'B6',
  'B7',
  'B8',
  'B9',
  'B10',
];
const OUT_OF_SCOPE_IDS = ['B1', 'B2', 'C2', 'C3', 'C4', 'C5', 'T3'];

// The check ids lintSource may add to checkResults when cross-layer flags
// are supplied — used by --full to know which NOT-CHECKABLE results to
// promote to FAIL (see the `full` handling in lintSource). Must match the
// Map keys used in the `checkResults.set(...)` calls below exactly.
const CROSS_LAYER_CHECK_IDS = [
  'UNKNOWN_ICON_SYMBOL',
  'UNTRACEABLE_VISUAL / MISSING_COMPONENT',
  'VIEW_REF_UNRESOLVED',
  'DIRECTION_GEOMETRY_CONFLICT',
  'CENSUS_MISMATCH',
  'RELATIONSHIP_ATTACHMENT_NOT_RENDERED',
];

// ---------------------------------------------------------------------------
// Tiny SVG tokenizer / tree builder. Deliberately not a real XML parser:
// good enough for the well-formed, generator-produced SVGs this tool is
// pointed at (no CDATA, no processing instructions with '>' inside, no
// attribute values containing '>'). Falls back to NOT-CHECKABLE per-rule
// rather than crashing when a file doesn't fit that shape.
// ---------------------------------------------------------------------------

function extractComments(text) {
  const comments = [];
  const stripped = text.replace(/<!--([\s\S]*?)-->/g, (match, inner) => {
    comments.push(inner);
    return ' '.repeat(match.length);
  });
  return { comments, stripped };
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(str))) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return attrs;
}

const TAG_RE = /<(\/)?([a-zA-Z][\w:-]*)([^>]*)>/g;

function buildTree(strippedText) {
  const root = { tag: '#root', attrs: {}, parent: null, children: [], raw: '' };
  const stack = [root];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(strippedText))) {
    const isClose = m[1] === '/';
    const tagName = m[2];
    let rest = m[3] || '';
    let selfClose = false;
    if (/\/\s*$/.test(rest)) {
      selfClose = true;
      rest = rest.replace(/\/\s*$/, '');
    }
    if (isClose) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tagName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs = parseAttrs(rest);
    const node = {
      tag: tagName,
      attrs,
      parent: stack[stack.length - 1],
      children: [],
      raw: m[0].length > 220 ? `${m[0].slice(0, 217)}...` : m[0],
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

function collectAll(root, tagName) {
  const out = [];
  (function walk(n) {
    for (const c of n.children) {
      if (c.tag === tagName) out.push(c);
      walk(c);
    }
  })(root);
  return out;
}

function isInsideDefsOrMarker(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.tag === 'defs' || p.tag === 'marker') return true;
  }
  return false;
}

function getEffectiveAttr(node, name) {
  for (let n = node; n; n = n.parent) {
    if (n.attrs && n.attrs[name] !== undefined) return n.attrs[name];
  }
  return undefined;
}

function previousRectSibling(node) {
  if (!node.parent) return null;
  const siblings = node.parent.children;
  const idx = siblings.indexOf(node);
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (siblings[i].tag === 'rect') return siblings[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const num = (v) => (v === undefined ? undefined : Number.parseFloat(v));

function rectBBox(node) {
  const x = num(node.attrs.x) ?? 0;
  const y = num(node.attrs.y) ?? 0;
  const w = num(node.attrs.width);
  const h = num(node.attrs.height);
  if (w === undefined || h === undefined || Number.isNaN(w) || Number.isNaN(h)) return null;
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y, w, h, x2: x + w, y2: y + h };
}

function parsePoints(str) {
  if (!str) return [];
  const nums = str.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2)
    pts.push([Number.parseFloat(nums[i]), Number.parseFloat(nums[i + 1])]);
  return pts;
}

// Only handles straight-segment paths (M/L/Z, any case). Returns null
// (NOT-CHECKABLE upstream) if the path uses curves/arcs (C/S/Q/T/A) — this
// tool does not attempt to locate a "tip" on a curved shape.
function parseSimplePathVertices(d) {
  if (!d) return null;
  if (/[csqtaCSQTA]/.test(d)) return null;
  return parsePoints(d);
}

function strictlyContains(outer, inner) {
  const EPS = 0.01;
  return (
    outer.x <= inner.x + EPS &&
    outer.y <= inner.y + EPS &&
    outer.x2 >= inner.x2 - EPS &&
    outer.y2 >= inner.y2 - EPS &&
    outer.w * outer.h > inner.w * inner.h + EPS
  );
}

// Splits every bordered <rect> into "container" (geometrically contains at
// least one other bordered rect — e.g. a lane, a boundary, a nested-group
// wrapper) vs "leaf" (a real content/node box). A rect only counts as a
// candidate "child" for this test if it itself has a real stroke — pure
// fill decorations (icons with no stroke) never turn their host box into a
// "container". This is the mechanical proxy this tool uses everywhere it
// needs to distinguish a structural grouping box from an actual node.
function classifyRects(root) {
  const allRects = collectAll(root, 'rect').filter((r) => !isInsideDefsOrMarker(r));
  const bordered = allRects
    .map((node) => ({ node, bbox: rectBBox(node) }))
    .filter(
      (r) => r.bbox && r.node.attrs.stroke && r.node.attrs.stroke.trim().toLowerCase() !== 'none',
    );
  const containerSet = new Set();
  for (const a of bordered) {
    for (const b of bordered) {
      if (a === b) continue;
      if (strictlyContains(a.bbox, b.bbox)) {
        containerSet.add(a);
        break;
      }
    }
  }
  const leaves = bordered.filter((r) => !containerSet.has(r));
  return { bordered, leaves, containers: [...containerSet] };
}

function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function findCanvasBackgroundHex(root) {
  const svg = collectAll(root, 'svg')[0] ?? (root.children.find((c) => c.tag === 'svg') || null);
  if (!svg) return null;
  let vb = svg.attrs.viewBox ? svg.attrs.viewBox.trim().split(/\s+/).map(Number) : null;
  if (!vb || vb.length !== 4 || vb.some(Number.isNaN)) {
    const w = num(svg.attrs.width);
    const h = num(svg.attrs.height);
    if (w === undefined || h === undefined) return null;
    vb = [0, 0, w, h];
  }
  const [vx, vy, vw, vh] = vb;
  const rects = collectAll(root, 'rect').filter((r) => !isInsideDefsOrMarker(r));
  for (const r of rects) {
    const bbox = rectBBox(r);
    if (!bbox) continue;
    if (
      Math.abs(bbox.x - vx) < 0.5 &&
      Math.abs(bbox.y - vy) < 0.5 &&
      Math.abs(bbox.w - vw) < 0.5 &&
      Math.abs(bbox.h - vh) < 0.5
    ) {
      const fill = r.attrs.fill;
      if (fill && /^#[0-9a-fA-F]{3,8}$/.test(fill.trim())) return fill.trim().toUpperCase();
    }
  }
  return null;
}

function truncate(s, n = 220) {
  if (!s) return s;
  return s.length > n ? `${s.slice(0, n - 3)}...` : s;
}

// ---------------------------------------------------------------------------
// Rule checks
// ---------------------------------------------------------------------------

function hasMarkerRef(attrs) {
  return Boolean(attrs['marker-end'] || attrs['marker-start'] || attrs['marker-mid']);
}

// rule 4: no <path> with C/S bezier commands used as a connector.
// Heuristic (per task brief): any marker-ended <path> whose `d` contains a
// C/S command is a FAIL. Q (quadratic) and A (elliptical arc) are NOT
// banned here as of rule 3a (2026-08-24): an orthogonal connector is
// allowed to round its 90° bends with a small Q/A arc, per rule 3a below —
// only a real bezier curve used to smooth-route a connector (C/S) is what
// this rule exists to catch. A curved <path> with NO marker (a decorative
// icon glyph, e.g. a smiley on an actor icon) is out of scope for this
// rule either way — it isn't a connector — and is intentionally not
// flagged.
const BEZIER_BAN_RE = /[csCS]/;
function checkRule4(root) {
  const paths = collectAll(root, 'path').filter((p) => !isInsideDefsOrMarker(p));
  const offenders = paths.filter(
    (p) => hasMarkerRef(p.attrs) && BEZIER_BAN_RE.test(p.attrs.d || ''),
  );
  if (offenders.length > 0) {
    return {
      status: 'FAIL',
      message: `${offenders.length} marker-ended <path> element(s) contain C/S bezier commands (connectors must be <polyline>/<line>, or a <path> using only M/L/H/V plus Q/A corner arcs per rule 3a)`,
      snippet: truncate(offenders[0].raw),
    };
  }
  return {
    status: 'PASS',
    message: `no marker-ended <path> uses C/S bezier commands (${paths.length} <path> element(s) scanned; Q/A corner arcs are allowed, see rule 3a)`,
  };
}

// rule 3a: every 90° bend in an orthogonal connector gets ONE uniform small
// arc radius (rule adopted 2026-08-24, diagram-rules.md; amended
// 2026-08-24 — the original reproduce-mode exemption was REMOVED, rounding
// is now normative in both conversion modes, and a clamp clause was
// added). Checkable subset (deliberately narrower than the full rule text,
// per the task brief that introduced this check): once ANY connector bend
// in the file is rounded, EVERY bend across EVERY connector must share
// that same radius — a mix of sharp and rounded bends anywhere (even
// within one connector) is a FAIL — UNLESS a smaller radius is justified
// by the clamp clause: an adjacent original segment shorter than 2x the
// diagram's uniform radius clamps that bend's arc to
// min(uniformRadius, leg/2) for the short leg (see checkRule3a's own doc
// comment below for how the original, pre-trim leg lengths are
// reconstructed from a rounded path's `d` alone). A rounded bend smaller
// than the uniform radius with NO such short-leg justification is still a
// FAIL. A diagram whose connectors are still all sharp-cornered predates
// the rule and is reported WARN, not FAIL — old diagrams are not
// hard-failed retroactively (only the showcase files a task explicitly
// upgrades need to reach PASS).
//
// "Connector", for this check, means:
//   - a <polyline> with >=1 real (non-collinear) interior vertex — a sharp
//     bend by construction, since <polyline> has no way to express a
//     curve; or
//   - a <path> whose `d` tokenizes (see tokenizePathD) into ONLY
//     M/L/H/V/Q/A commands, starts with a straight (L/H/V) run right after
//     its one leading M, and ends with a straight run. That shape
//     requirement is what excludes decorative curved <path>s that were
//     never connectors at all — e.g. a smiley-mouth glyph drawn as bare
//     "M...Q..." (kubernetes' Tester actor icon) or a database-cylinder
//     icon drawn as "M...A...Z" (microservices-c4): a real orthogonal
//     connector's first and last leg is always a straight run departing/
//     arriving at a box edge (rule 2), never a bare curve at either end.
// A <path> this tool can't reduce to that shape — lowercase/relative
// commands, a C/S bezier (already rule 4's job), a second subpath (a
// second M), or a curve with no adjoining straight run — is silently
// excluded from this check rather than guessed at, same posture as rule
// 9's marker-tip heuristic.
function tokenizePathD(d) {
  if (!d) return null;
  const commandCharsOnly = d.replace(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g, '').replace(/[,\s]/g, '');
  if (commandCharsOnly === '' || !/^[MLHVQAZ]*$/.test(commandCharsOnly)) return null;
  const re = /([MLHVQAZ])([^MLHVQAZ]*)/g;
  const cmds = [];
  let m;
  while ((m = re.exec(d))) {
    const args = (m[2].match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || []).map(Number);
    cmds.push({ cmd: m[1], args });
  }
  return cmds.length > 0 ? cmds : null;
}

// Walks a tokenized path (see tokenizePathD) into {type: 'straight'|'arc',
// radius?, length?} segments and classifies its bends. Returns null when
// the shape isn't a connector this heuristic can classify (see
// checkRule3a's doc comment). For a Q command, the radius is the distance
// from the point reached by the PRECEDING straight run to the Q's control
// point — exact by construction for the "trim each leg by r, curve through
// the original sharp vertex" technique this tool's own converter uses (see
// tools/round-connectors.mjs). For an A command, the radius is read
// directly off its rx parameter.
//
// Clamp-clause support: for a PURE rounded path (no sharp corners
// interleaved — the only shape the clamp justification below needs), also
// returns `bends`, one entry per arc with its RECONSTRUCTED original
// (pre-trim) adjacent leg lengths. round-connectors.mjs's clamp trims each
// leg touching a bend by that bend's own r_eff, so a straight run's
// rendered length is (original leg length - the r_eff trimmed off each end
// that touches it) — meaning the original leg length is recoverable as
// (rendered run length + the r_eff(s) trimmed off its end(s)), walking the
// straight/arc/straight/arc/.../straight sequence in order. This is exact
// by construction for this tool's own converter output, and is what lets
// checkRule3a verify a clamped bend's smaller radius against the ORIGINAL
// segment (as rule 3a's clamp clause is written), not the already-trimmed
// visible run.
function classifyConnectorPathSegments(cmds) {
  if (!cmds || cmds[0].cmd !== 'M' || cmds[0].args.length < 2) return null;
  let cur = [cmds[0].args[0], cmds[0].args[1]];
  const segs = [];
  for (let i = 1; i < cmds.length; i += 1) {
    const { cmd, args } = cmds[i];
    if (cmd === 'M') return null; // a second subpath -- not a simple connector shape
    if (cmd === 'L') {
      if (args.length < 2) return null;
      const next = [args[0], args[1]];
      segs.push({ type: 'straight', length: Math.hypot(next[0] - cur[0], next[1] - cur[1]) });
      cur = next;
    } else if (cmd === 'H') {
      if (args.length < 1) return null;
      const next = [args[0], cur[1]];
      segs.push({ type: 'straight', length: Math.abs(next[0] - cur[0]) });
      cur = next;
    } else if (cmd === 'V') {
      if (args.length < 1) return null;
      const next = [cur[0], args[0]];
      segs.push({ type: 'straight', length: Math.abs(next[1] - cur[1]) });
      cur = next;
    } else if (cmd === 'Q') {
      if (args.length < 4) return null;
      const radius = Math.hypot(args[0] - cur[0], args[1] - cur[1]);
      segs.push({ type: 'arc', radius });
      cur = [args[2], args[3]];
    } else if (cmd === 'A') {
      if (args.length < 7) return null;
      segs.push({ type: 'arc', radius: args[0] });
      cur = [args[5], args[6]];
    } else if (cmd === 'Z') {
      segs.push({ type: 'straight', length: 0 });
    } else {
      return null;
    }
  }
  if (segs.length === 0) return null;
  if (segs[0].type !== 'straight' || segs[segs.length - 1].type !== 'straight') return null;

  let sharpBends = 0;
  let roundedBends = 0;
  const radii = [];
  for (const s of segs) {
    if (s.type === 'arc') {
      roundedBends += 1;
      radii.push(s.radius);
    }
  }
  for (let i = 0; i + 1 < segs.length; i += 1) {
    if (segs[i].type === 'straight' && segs[i + 1].type === 'straight') sharpBends += 1;
  }

  let bends = null;
  if (sharpBends === 0 && roundedBends > 0) {
    const straightLens = segs.filter((s) => s.type === 'straight').map((s) => s.length ?? 0);
    const arcs = segs.filter((s) => s.type === 'arc');
    const k = arcs.length;
    // legs[j] = original length of the segment between original vertices
    // (j-1) and j, 1-indexed (legs[1]..legs[k+1]); rebuilt per the doc
    // comment above.
    const legs = new Array(k + 2);
    legs[1] = straightLens[0] + arcs[0].radius;
    for (let j = 1; j <= k - 1; j += 1) {
      legs[j + 1] = straightLens[j] + arcs[j - 1].radius + arcs[j].radius;
    }
    legs[k + 1] = straightLens[k] + arcs[k - 1].radius;
    bends = arcs.map((a, idx) => ({
      radius: a.radius,
      legIn: legs[idx + 1],
      legOut: legs[idx + 2],
    }));
  }

  return { sharpBends, roundedBends, radii, bends };
}

// A <polyline> interior vertex is a real bend only if it actually turns —
// a redundant collinear waypoint (e.g. a 3-way fan-out's straight-through
// branch repeating the shared fan vertex as its own middle point) is not
// one, and has nothing to round.
function polylineHasRealBend(pts) {
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [px, py] = pts[i - 1];
    const [vx, vy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const cross = (vx - px) * (ny - vy) - (vy - py) * (nx - vx);
    if (Math.abs(cross) > 1e-6) return true;
  }
  return false;
}

const RADIUS_EPS = 0.05;

function checkRule3a(root) {
  const elements = [];

  for (const p of collectAll(root, 'polyline')) {
    if (isInsideDefsOrMarker(p)) continue;
    const pts = parsePoints(p.attrs.points);
    if (pts.length < 3 || !polylineHasRealBend(pts)) continue;
    elements.push({ node: p, kind: 'sharp', radii: [], bends: null });
  }

  const mixedElementOffenders = [];
  for (const p of collectAll(root, 'path')) {
    if (isInsideDefsOrMarker(p)) continue;
    const classified = classifyConnectorPathSegments(tokenizePathD(p.attrs.d));
    if (!classified) continue; // not a connector shape this heuristic understands
    const { sharpBends, roundedBends, radii, bends } = classified;
    if (sharpBends === 0 && roundedBends === 0) continue; // no bend (single straight run)
    if (sharpBends > 0 && roundedBends > 0) {
      mixedElementOffenders.push(p);
      continue;
    }
    elements.push({ node: p, kind: roundedBends > 0 ? 'rounded' : 'sharp', radii, bends });
  }

  if (mixedElementOffenders.length > 0) {
    return {
      status: 'FAIL',
      message: `${mixedElementOffenders.length} connector(s) mix sharp and rounded bends within the SAME element (rule 3a requires one uniform radius for every bend)`,
      snippet: truncate(mixedElementOffenders[0].raw),
    };
  }

  const sharpEls = elements.filter((e) => e.kind === 'sharp');
  const roundedEls = elements.filter((e) => e.kind === 'rounded');

  if (roundedEls.length === 0 && sharpEls.length === 0) {
    return { status: 'NOT-CHECKABLE', message: 'no connector bends found (nothing to round)' };
  }
  if (roundedEls.length === 0) {
    return {
      status: 'WARN',
      message: `rule 3a adopted 2026-08-24; ${sharpEls.length} connector(s) with sharp (unrounded) bends predate it — not hard-failed`,
    };
  }
  if (sharpEls.length > 0) {
    return {
      status: 'FAIL',
      message: `mixed corner treatment: ${roundedEls.length} connector(s) use rounded bends, ${sharpEls.length} are still sharp (rule 3a requires ALL bends rounded once any are)`,
      snippet: truncate(sharpEls[0].node.raw),
    };
  }

  // Every element is rounded. Flatten every bend and determine the
  // diagram's uniform radius R as the LARGEST radius present — the clamp
  // clause only ever shrinks a bend's radius below R (r_eff =
  // min(R, leg/2) <= R always), so at least one un-clamped bend should
  // carry the full R.
  const allBends = [];
  for (const e of roundedEls) {
    if (e.bends) {
      for (const b of e.bends) allBends.push({ ...b, node: e.node });
    } else {
      // A rounded <path> this tool couldn't reduce to leg lengths (e.g. an
      // interior sharp corner already routed to mixedElementOffenders
      // above, so this is defensive only) still contributes its radius to
      // the uniform-radius comparison, just without clamp-justification
      // evidence.
      for (const r of e.radii) {
        allBends.push({ radius: r, legIn: undefined, legOut: undefined, node: e.node });
      }
    }
  }

  const R = Math.max(...allBends.map((b) => b.radius));

  const unjustified = [];
  const clamped = [];
  for (const b of allBends) {
    if (Math.abs(b.radius - R) < RADIUS_EPS) continue; // at the uniform radius -- fine
    // Smaller than R: rule 3a's clamp clause permits this ONLY when an
    // adjacent ORIGINAL segment is under 2xR, and only at exactly the
    // clamped value the formula produces -- not merely "some smaller
    // number".
    const hasShortLeg =
      b.legIn !== undefined &&
      b.legOut !== undefined &&
      Math.min(b.legIn, b.legOut) < 2 * R - RADIUS_EPS;
    const expectedClamp = hasShortLeg ? Math.min(R, b.legIn / 2, b.legOut / 2) : undefined;
    const matchesClamp =
      expectedClamp !== undefined && Math.abs(b.radius - expectedClamp) < RADIUS_EPS;
    if (hasShortLeg && matchesClamp) clamped.push(b);
    else unjustified.push(b);
  }

  if (unjustified.length > 0) {
    const uniqueRadii = [];
    for (const b of allBends) {
      if (!uniqueRadii.some((u) => Math.abs(u - b.radius) < RADIUS_EPS)) uniqueRadii.push(b.radius);
    }
    return {
      status: 'FAIL',
      message:
        `${roundedEls.length} rounded connector(s) use ${uniqueRadii.length} different corner radii: ` +
        `${uniqueRadii.map((r) => round(r, 2)).join(', ')} (${unjustified.length} bend(s) smaller than the ` +
        `uniform radius ${round(R, 2)} with no adjacent original segment under 2x${round(R, 2)} to justify ` +
        `the clamp — rule 3a's clamp clause requires that justification, not just a smaller number)`,
      snippet: truncate(unjustified[0].node.raw),
    };
  }

  const clampNote = clamped.length
    ? `, ${clamped.length} bend(s) clamped below ${round(R, 2)} for a short adjacent segment (rule 3a clamp clause)`
    : '';
  return {
    status: 'PASS',
    message: `${roundedEls.length} rounded connector(s), ${allBends.length} bend(s) total, all one uniform radius ${round(R, 2)}${clampNote}`,
  };
}

// rule 7: every <marker> uses markerUnits="userSpaceOnUse" and the whole
// file shares one markerWidth/markerHeight (arrowhead size decoupled from
// stroke-width, and uniform across the diagram).
function checkRule7(root) {
  const markers = collectAll(root, 'marker');
  if (markers.length === 0)
    return { status: 'NOT-CHECKABLE', message: 'no <marker> elements found' };
  const badUnits = markers.filter((m) => m.attrs.markerUnits !== 'userSpaceOnUse');
  if (badUnits.length > 0) {
    return {
      status: 'FAIL',
      message: `${badUnits.length}/${markers.length} <marker> element(s) missing markerUnits="userSpaceOnUse"`,
      snippet: truncate(badUnits[0].raw),
    };
  }
  const sizes = new Set(markers.map((m) => `${m.attrs.markerWidth}x${m.attrs.markerHeight}`));
  if (sizes.size > 1) {
    return {
      status: 'FAIL',
      message: `markers use ${sizes.size} different markerWidth/markerHeight sizes: ${[...sizes].join(', ')}`,
      snippet: truncate(markers[0].raw),
    };
  }
  return {
    status: 'PASS',
    message: `${markers.length} marker(s), all markerUnits="userSpaceOnUse", one shared size ${[...sizes][0]}`,
  };
}

// rule 8: every connector shares one stroke-width. Connectors are
// <polyline>/<line> plus marker-ended <path> (the rule-3a rounded-corner
// form) — without the <path> arm, converting a polyline to a rounded path
// would silently drop it from this check's coverage.
// stroke-width is resolved with SVG inheritance (own attribute, else
// nearest ancestor's) since several examples set it once on a wrapping
// <g> rather than per-element; falls back to the SVG default of 1.
function checkRule8(root) {
  const connectors = [
    ...collectAll(root, 'polyline'),
    ...collectAll(root, 'line'),
    ...collectAll(root, 'path').filter((p) => hasMarkerRef(p.attrs)),
  ].filter((c) => !isInsideDefsOrMarker(c));
  if (connectors.length === 0) {
    return {
      status: 'NOT-CHECKABLE',
      message: 'no <polyline>/<line>/marker-ended <path> connector elements found',
    };
  }
  const groups = new Map();
  for (const c of connectors) {
    const w = getEffectiveAttr(c, 'stroke-width') ?? '1 (SVG default)';
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w).push(c);
  }
  if (groups.size === 1) {
    return {
      status: 'PASS',
      message: `all ${connectors.length} connector(s) share stroke-width ${[...groups.keys()][0]}`,
    };
  }
  const summary = [...groups.entries()].map(([k, v]) => `${k}×${v.length}`).join(', ');
  const smallestGroup = [...groups.values()].sort((a, b) => a.length - b.length)[0];
  return {
    status: 'FAIL',
    message: `connectors use ${groups.size} different stroke-widths: ${summary}`,
    snippet: truncate(smallestGroup[0].raw),
  };
}

// rule 9: marker refX equals the tip x of its polygon/path viewBox.
// "Tip" is taken as the vertex with the largest local x — valid for the
// orient="auto"/"auto-start-reverse" rightward-pointing triangle
// convention every example here uses; a marker shape this tool can't
// reduce to a clean single max-x vertex (curves/arcs, or a tie) is
// reported NOT-CHECKABLE rather than guessed at.
function checkRule9(root) {
  const markers = collectAll(root, 'marker');
  if (markers.length === 0)
    return { status: 'NOT-CHECKABLE', message: 'no <marker> elements found' };
  const outcomes = [];
  for (const m of markers) {
    const shape = m.children.find((c) => c.tag === 'path' || c.tag === 'polygon');
    if (!shape) {
      outcomes.push({ marker: m, status: 'NOT-CHECKABLE' });
      continue;
    }
    const verts =
      shape.tag === 'polygon'
        ? parsePoints(shape.attrs.points)
        : parseSimplePathVertices(shape.attrs.d);
    if (!verts || verts.length === 0) {
      outcomes.push({ marker: m, status: 'NOT-CHECKABLE' });
      continue;
    }
    const maxX = Math.max(...verts.map((v) => v[0]));
    const tipCandidates = verts.filter((v) => Math.abs(v[0] - maxX) < 0.001);
    const refX = num(m.attrs.refX);
    if (tipCandidates.length !== 1 || refX === undefined || Number.isNaN(refX)) {
      outcomes.push({ marker: m, status: 'NOT-CHECKABLE' });
      continue;
    }
    outcomes.push({
      marker: m,
      status: Math.abs(refX - maxX) < 0.01 ? 'PASS' : 'FAIL',
      tipX: maxX,
      refX,
    });
  }
  const checkable = outcomes.filter((o) => o.status !== 'NOT-CHECKABLE');
  const fails = outcomes.filter((o) => o.status === 'FAIL');
  if (checkable.length === 0) {
    return {
      status: 'NOT-CHECKABLE',
      message: `${markers.length} marker(s), none reduced to a single unambiguous tip vertex`,
    };
  }
  if (fails.length > 0) {
    return {
      status: 'FAIL',
      message: `${fails.length}/${checkable.length} checkable marker(s) have refX != shape tip x (e.g. refX=${fails[0].refX}, tip x=${fails[0].tipX})`,
      snippet: truncate(fails[0].marker.raw),
    };
  }
  const skipped = markers.length - checkable.length;
  return {
    status: 'PASS',
    message:
      `${checkable.length}/${markers.length} marker(s) verified refX == tip x` +
      (skipped ? `, ${skipped} not checkable` : ''),
  };
}

// rule 10: any stroke-dasharray usage must be explained by a comment
// mentioning "dash"/"虚线" somewhere in the file (not required to be the
// same comment that documents the palette).
function checkRule10(root, allCommentsText) {
  const dashed = [];
  (function walk(n) {
    for (const c of n.children) {
      if (!isInsideDefsOrMarker(c)) {
        const da = getEffectiveAttr(c, 'stroke-dasharray');
        if (da && da.trim() !== 'none' && da.trim() !== '') dashed.push(c);
      }
      walk(c);
    }
  })(root);
  if (dashed.length === 0) {
    return {
      status: 'PASS',
      message: 'no stroke-dasharray usage in the file (nothing to document)',
    };
  }
  if (/dash|虚线/i.test(allCommentsText)) {
    return {
      status: 'PASS',
      message: `${dashed.length} dashed element(s) found; a comment in the file documents "dash"/"虚线"`,
    };
  }
  return {
    status: 'FAIL',
    message: `${dashed.length} dashed element(s) found but no comment documents dash usage`,
    snippet: truncate(dashed[0].raw),
  };
}

// C1: a comment block documents the semantic palette, and every fill/stroke
// hex in the file is covered by it (modulo white/none/transparent and the
// full-canvas background rect's own fill).
function checkC1(root, comments) {
  const withHex = comments
    .map((text) => ({
      text,
      hexes: [...new Set((text.match(/#[0-9a-fA-F]{3,8}/g) || []).map((h) => h.toUpperCase()))],
    }))
    .filter((c) => c.hexes.length >= 2);
  if (withHex.length === 0) {
    return {
      status: 'FAIL',
      message: 'no comment block documents a color palette (>=2 hex colors)',
    };
  }
  withHex.sort((a, b) => b.hexes.length - a.hexes.length);
  const paletteSet = new Set(withHex[0].hexes);

  const usedHexes = new Map();
  (function walk(n) {
    for (const c of n.children) {
      for (const attrName of ['fill', 'stroke']) {
        const v = c.attrs[attrName];
        if (v && /^#[0-9a-fA-F]{3,8}$/.test(v.trim())) {
          const hex = v.trim().toUpperCase();
          if (!usedHexes.has(hex)) usedHexes.set(hex, []);
          usedHexes.get(hex).push(c);
        }
      }
      walk(c);
    }
  })(root);

  const exempt = new Set(['#FFF', '#FFFFFF']);
  const canvasBgHex = findCanvasBackgroundHex(root);
  if (canvasBgHex) exempt.add(canvasBgHex);

  const undocumented = [];
  for (const [hex, nodes] of usedHexes) {
    if (exempt.has(hex)) continue;
    if (!paletteSet.has(hex)) undocumented.push({ hex, node: nodes[0] });
  }
  if (undocumented.length === 0) {
    return {
      status: 'PASS',
      message: `palette comment documents ${paletteSet.size} color(s); all ${usedHexes.size} used fill/stroke hex color(s) are covered (modulo white/canvas background)`,
    };
  }
  return {
    status: 'FAIL',
    message: `${undocumented.length} hex color(s) used but not in the palette comment: ${undocumented.map((u) => u.hex).join(', ')}`,
    snippet: truncate(undocumented[0].node.raw),
  };
}

// B4: leaf/node rect border stroke-widths are uniform. Structural
// containers (lanes, boundaries, nested-group wrappers — found by
// geometric containment of another bordered rect, see classifyRects) are
// excluded: the rule text explicitly allows a distinct, consistently
// applied class for them.
function checkB4(root) {
  const { leaves, containers } = classifyRects(root);
  if (leaves.length === 0) {
    return { status: 'NOT-CHECKABLE', message: 'no leaf/node rects with a stroke found' };
  }
  const groups = new Map();
  for (const r of leaves) {
    const w = r.node.attrs['stroke-width'] ?? '1 (SVG default)';
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w).push(r.node);
  }
  const containerNote = containers.length
    ? `; ${containers.length} container rect(s) excluded from this class`
    : '';
  if (groups.size === 1) {
    return {
      status: 'PASS',
      message: `all ${leaves.length} leaf-node rects share border stroke-width ${[...groups.keys()][0]}${containerNote}`,
    };
  }
  const summary = [...groups.entries()].map(([k, v]) => `${k}×${v.length}`).join(', ');
  const smallestGroup = [...groups.values()].sort((a, b) => a.length - b.length)[0];
  return {
    status: 'FAIL',
    message: `leaf-node rects use ${groups.size} different border stroke-widths: ${summary}${containerNote}`,
    snippet: truncate(smallestGroup[0].raw),
  };
}

// B2-lite: vertical gap between immediately-stacked sibling leaf rects
// (same x + width, nothing else of that column in between). This is a
// deliberately narrow proxy for "one uniform row gap" — it can't see
// lane/grid semantics, only coincidental x-alignment, so it is reported
// as a best-effort finding (the actual gap values), PASS only when <=2
// distinct values turn up. Rects smaller than a plausible node (e.g.
// legend swatches/icons) are excluded so they don't manufacture spurious
// "columns" out of decorative elements.
//
// A gap larger than ~2x the shorter of the two boxes is excluded: rule
// B2's own text is about a gap between boxes that are visually STACKED
// (one tight lane/column), not any two rects that happen to land at the
// same x by coincidence of an unrelated grid a whole section apart (e.g.
// a web-tier instance and an app-tier instance two rows below, with a
// load balancer and a merge bus genuinely in between). This threshold
// keeps genuine same-lane stacks while dropping that class of
// cross-section false positive.
function checkB2Lite(root) {
  const { leaves } = classifyRects(root);
  const candidates = leaves.filter((r) => r.bbox.w >= 30 && r.bbox.h >= 15);
  const columns = new Map();
  for (const r of candidates) {
    const key = `${round(r.bbox.x)}|${round(r.bbox.w)}`;
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(r);
  }
  const gapValues = new Set();
  let firstExample = null;
  for (const list of columns.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.bbox.y - b.bbox.y);
    for (let i = 0; i < list.length - 1; i += 1) {
      const gap = round(list[i + 1].bbox.y - list[i].bbox.y2);
      if (gap <= 0) continue;
      const maxPlausibleGap = 2 * Math.min(list[i].bbox.h, list[i + 1].bbox.h);
      if (gap > maxPlausibleGap) continue;
      gapValues.add(gap);
      if (!firstExample) firstExample = list[i].node;
    }
  }
  if (gapValues.size === 0) {
    return {
      status: 'NOT-CHECKABLE',
      message: 'no vertically-stacked sibling leaf rects found (nothing shares both x and width)',
    };
  }
  const values = [...gapValues].sort((a, b) => a - b);
  if (values.length <= 2) {
    return { status: 'PASS', message: `vertical gap value(s) found: ${values.join(', ')}` };
  }
  return {
    status: 'FAIL',
    message: `vertical gap values found: ${values.join(', ')} (more than 2 distinct values)`,
    snippet: firstExample ? truncate(firstExample.raw) : undefined,
  };
}

// T2-lite: a node-label <text>'s x/y anchor falls inside the rect it
// labels. "Its rect" is taken as the nearest preceding <rect> sibling
// (these SVGs are generated as rect-then-text pairs), and only when that
// rect is a leaf/node (not a container/boundary title) and large enough
// to plausibly hold a label (excludes legend-swatch captions, which sit
// beside a tiny icon by design, not inside it). Everything else — edge
// labels, container titles, legend captions, anything not confidently a
// node label — is left NOT-CHECKABLE rather than guessed at.
function checkT2Lite(root) {
  const { leaves } = classifyRects(root);
  const leafSet = new Set(leaves.map((l) => l.node));
  const texts = collectAll(root, 'text').filter((t) => !isInsideDefsOrMarker(t));
  let checked = 0;
  let failed = 0;
  let firstFail = null;
  for (const t of texts) {
    const prevRect = previousRectSibling(t);
    if (!prevRect || !leafSet.has(prevRect)) continue;
    const bbox = rectBBox(prevRect);
    if (!bbox || bbox.w < 30 || bbox.h < 15) continue;
    const x = num(t.attrs.x);
    const y = num(t.attrs.y);
    if (x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y)) continue;
    checked += 1;
    const inside =
      x >= bbox.x - 0.5 && x <= bbox.x2 + 0.5 && y >= bbox.y - 0.5 && y <= bbox.y2 + 0.5;
    if (!inside) {
      failed += 1;
      if (!firstFail) firstFail = t;
    }
  }
  if (checked === 0) {
    return {
      status: 'NOT-CHECKABLE',
      message: `${texts.length} <text> element(s) found, none confidently paired with a leaf-node rect (edge labels/titles/captions excluded)`,
    };
  }
  if (failed > 0) {
    return {
      status: 'FAIL',
      message: `${failed}/${checked} node-label text anchor(s) fall outside their paired rect`,
      snippet: truncate(firstFail.raw),
    };
  }
  return {
    status: 'PASS',
    message: `${checked}/${texts.length} node-label text anchor(s) verified inside their rect (${texts.length - checked} skipped as not confidently a node label)`,
  };
}

// ---------------------------------------------------------------------------
// Cross-layer checks (need model.yaml / view.yaml / census.yaml / layout.json
// alongside the SVG — see USAGE for which flags each one needs).
// ---------------------------------------------------------------------------

// The rule this tool enforces everywhere an icon id crosses from view.yaml
// (dotted, e.g. "aws.ec2-instance", matching tokens.yaml's enum values) into
// an SVG <symbol> id (hyphenated, e.g. "icon-aws-ec2-instance" — SVG ids
// used as CSS id selectors are safer without a literal "."): the symbol id
// is always `icon-` + the icon id with every "." replaced by "-".
function svgSymbolIdForIcon(iconId) {
  return `icon-${iconId.replace(/\./g, '-')}`;
}

// The nine-grid box-anchor enum (view.yaml README: "top/middle/bottom x
// left/center/right"), plus the one non-grid anchor edge attachments use.
const NINE_GRID_ANCHORS = new Set([
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);

function collectIconIdsFromView(view) {
  const ids = new Set();
  const addAll = (byId) => {
    if (!byId) return;
    for (const attachments of Object.values(byId)) {
      if (!Array.isArray(attachments)) continue;
      for (const attachment of attachments) {
        if (attachment && typeof attachment.icon === 'string') ids.add(attachment.icon);
      }
    }
  };
  addAll(view.components);
  addAll(view.relationships);
  return ids;
}

// UNKNOWN_ICON_SYMBOL (requires --view): every icon id view.yaml references
// must resolve (via svgSymbolIdForIcon) to a <symbol> actually defined in
// the SVG. The reverse direction — a defined <symbol> no view.yaml
// attachment uses — is reported too, but as WARN: an unused glyph in the
// shared icon set isn't a defect the way a dangling reference is.
function checkUnknownIconSymbol(root, view) {
  const iconIds = collectIconIdsFromView(view);
  if (iconIds.size === 0)
    return {
      status: 'NOT-CHECKABLE',
      message: 'view.yaml has no component/relationship icon attachments',
    };
  const symbolIds = new Set(
    collectAll(root, 'symbol')
      .map((s) => s.attrs.id)
      .filter(Boolean),
  );
  const expected = new Map([...iconIds].map((iconId) => [iconId, svgSymbolIdForIcon(iconId)]));
  const missing = [...expected].filter(([, symbolId]) => !symbolIds.has(symbolId));
  if (missing.length > 0) {
    const [iconId, symbolId] = missing[0];
    return {
      status: 'FAIL',
      message:
        `UNKNOWN_ICON_SYMBOL: ${missing.length} icon id(s) referenced in view.yaml have no ` +
        `matching <symbol> (id maps "." -> "-"), e.g. icon "${iconId}" expects ` +
        `<symbol id="${symbolId}">, not found`,
    };
  }
  const usedSymbolIds = new Set(expected.values());
  const unused = [...symbolIds].filter((id) => !usedSymbolIds.has(id));
  if (unused.length > 0) {
    return {
      status: 'WARN',
      message: `${iconIds.size} icon id(s) all resolve to a symbol; ${unused.length} <symbol> id(s) defined in the SVG are unused by view.yaml: ${unused.join(', ')}`,
    };
  }
  return {
    status: 'PASS',
    message: `${iconIds.size} icon id(s) referenced in view.yaml all resolve to a matching <symbol id="icon-<id>">`,
  };
}

// Every element under root carrying `attrName` -> the list of nodes that
// carry it (an id should carry exactly one node; MISSING_COMPONENT/
// ATTACHMENT_NOT_RENDERED both need the actual node(s), not just a count).
function collectDataAttrNodes(root, attrName) {
  const nodes = new Map();
  (function walk(n) {
    for (const c of n.children) {
      const v = c.attrs && c.attrs[attrName];
      if (v !== undefined) {
        if (!nodes.has(v)) nodes.set(v, []);
        nodes.get(v).push(c);
      }
      walk(c);
    }
  })(root);
  return nodes;
}

// href (or xlink:href, for tooling that still emits it) target of a <use>,
// with the leading "#" stripped so it compares directly against a <symbol
// id="...">.
function useHrefTarget(node) {
  const href = node.attrs.href ?? node.attrs['xlink:href'];
  return href ? href.replace(/^#/, '') : undefined;
}

// The "element group" a declared attachment must render inside: the anchor
// node itself (a <rect data-component="..."> or <rect data-view-element="...">)
// plus every sibling drawn immediately after it, up to (not including) the
// next <rect> sibling or the end of the parent's children. This matches the
// authoring convention final.svg documents explicitly ("Order within each
// box is always rect, text, use — never a <rect> between the box rect and
// its title") and that T2-lite's previousRectSibling already relies on from
// the other direction.
function attachmentGroupMembers(anchorNode) {
  const parent = anchorNode.parent;
  if (!parent) return [anchorNode];
  const siblings = parent.children;
  const idx = siblings.indexOf(anchorNode);
  const members = [anchorNode];
  for (let i = idx + 1; i < siblings.length; i += 1) {
    if (siblings[i].tag === 'rect') break;
    members.push(siblings[i]);
  }
  return members;
}

// VIEW_REF_UNRESOLVED (requires --model + --view): a view document is
// presentation-only data (see view.yaml's own "View Layer Contract"
// preamble) — every id it names must resolve into model.yaml, and every
// attachment it declares must actually be visible in the SVG it describes.
// Three things are checked, each contributing to one combined FAIL:
//   1. every `components`/`relationships` key resolves to a model.yaml
//      component/relationship id (this is the gap that let a typo'd key —
//      e.g. "components.typo" — through silently: nothing else in this
//      file ever reads the KEYS of those maps, only the icon ids inside
//      their attachment lists).
//   2. every visualElements[].members entry resolves to a model.yaml
//      component id.
//   3. every attachment's shape is valid (icon: string, anchor: nine-grid
//      or "edge-midpoint", offset only alongside "edge-midpoint") and,
//      for component/visual-element attachments only, is actually rendered:
//      a <use> inside its element group whose href resolves to the icon's
//      expected <symbol>) — ATTACHMENT_NOT_RENDERED otherwise.
//      Relationship attachments (edge badges, e.g. the SSL padlock) are
//      shape-checked here only, not render-bound: final.svg's
//      data-relationship anchor (see examples/showcase/1-cloud-web-app/
//      final.svg's "SSL padlock badges" comment) binds an edge glyph to a
//      <g>, not to a rect-then-siblings element group the way
//      data-component/data-view-element do, so it needs a different
//      "what counts as inside" rule (descendants of the <g>, not following
//      siblings of an anchor rect) — see checkRelationshipAttachmentNotRendered
//      / RELATIONSHIP_ATTACHMENT_NOT_RENDERED below for that render binding.
function checkViewRefUnresolved(root, model, view) {
  const problems = [];
  const componentIds = new Set((model.components ?? []).map((c) => String(c.id)));
  const relationshipIds = new Set((model.relationships ?? []).map((r) => String(r.id)));
  const dataComponentNodes = collectDataAttrNodes(root, 'data-component');
  const dataViewElementNodes = collectDataAttrNodes(root, 'data-view-element');

  function validateAttachmentShape(where, attachment) {
    if (attachment === null || typeof attachment !== 'object') {
      problems.push(`${where}: attachment must be an object, got ${JSON.stringify(attachment)}`);
      return false;
    }
    let ok = true;
    if (typeof attachment.icon !== 'string' || attachment.icon.length === 0) {
      problems.push(
        `${where}: icon must be a non-empty string, got ${JSON.stringify(attachment.icon)}`,
      );
      ok = false;
    }
    if (attachment.anchor !== 'edge-midpoint' && !NINE_GRID_ANCHORS.has(attachment.anchor)) {
      problems.push(
        `${where}: anchor ${JSON.stringify(attachment.anchor)} is not a nine-grid position or "edge-midpoint"`,
      );
      ok = false;
    }
    if (attachment.offset !== undefined && attachment.anchor !== 'edge-midpoint') {
      problems.push(`${where}: offset is only allowed when anchor is "edge-midpoint"`);
      ok = false;
    }
    return ok;
  }

  function checkRendered(where, ownerId, attachment, nodesById) {
    const expectedSymbol = svgSymbolIdForIcon(attachment.icon);
    const nodes = nodesById.get(ownerId) ?? [];
    const rendered = nodes.some((anchorNode) =>
      attachmentGroupMembers(anchorNode).some(
        (member) => member.tag === 'use' && useHrefTarget(member) === expectedSymbol,
      ),
    );
    if (!rendered) {
      problems.push(
        `ATTACHMENT_NOT_RENDERED: ${where} declares icon "${attachment.icon}" (expects a ` +
          `<use href="#${expectedSymbol}">) but none was found inside the element group ` +
          `carrying data-component/data-view-element="${ownerId}"`,
      );
    }
  }

  function checkAttachmentList(ownerKind, ownerId, attachments, opts) {
    if (attachments === undefined) return;
    if (!Array.isArray(attachments)) {
      problems.push(
        `${ownerKind} "${ownerId}": attachments must be a list, got ${JSON.stringify(attachments)}`,
      );
      return;
    }
    attachments.forEach((attachment, index) => {
      const where = `${ownerKind} "${ownerId}" attachment[${index}]`;
      if (!validateAttachmentShape(where, attachment)) return;
      if (opts?.bindTo) checkRendered(where, ownerId, attachment, opts.bindTo);
    });
  }

  for (const [id, attachments] of Object.entries(view.components ?? {})) {
    if (!componentIds.has(id)) {
      problems.push(`view.components key "${id}" does not resolve to a model.yaml component id`);
      continue;
    }
    checkAttachmentList('component', id, attachments, { bindTo: dataComponentNodes });
  }

  for (const [id, attachments] of Object.entries(view.relationships ?? {})) {
    if (!relationshipIds.has(id)) {
      problems.push(
        `view.relationships key "${id}" does not resolve to a model.yaml relationship id`,
      );
      continue;
    }
    // Shape-only: see the function doc comment for why relationships aren't
    // render-bound.
    checkAttachmentList('relationship', id, attachments, {});
  }

  for (const ve of view.visualElements ?? []) {
    for (const memberId of ve.members ?? []) {
      if (!componentIds.has(String(memberId))) {
        problems.push(
          `view.visualElements "${ve.id}" member "${memberId}" does not resolve to a model.yaml component id`,
        );
      }
    }
    // Current schema examples never attach icons directly to a visual
    // element, but nothing rules it out — bind the same way as components
    // (against data-view-element) if a view.yaml ever does.
    checkAttachmentList('visualElement', ve.id, ve.attachments, { bindTo: dataViewElementNodes });
  }

  if (problems.length > 0) {
    return {
      status: 'FAIL',
      message: `VIEW_REF_UNRESOLVED: ${problems.length} problem(s), e.g. ${problems[0]}`,
    };
  }
  return {
    status: 'PASS',
    message:
      'every view.yaml components/relationships key and visualElements member resolves into ' +
      "model.yaml, every attachment's shape is valid, and every declared component/view-element " +
      'icon attachment is rendered inside its element group',
  };
}

// Every `tagName` descendant of `node` (not including `node` itself) — a
// subtree-scoped variant of collectAll, used below to search inside one
// data-relationship anchor's <g> rather than the whole document.
function collectDescendants(node, tagName) {
  const out = [];
  (function walk(n) {
    for (const c of n.children) {
      if (c.tag === tagName) out.push(c);
      walk(c);
    }
  })(node);
  return out;
}

// RELATIONSHIP_ATTACHMENT_NOT_RENDERED (requires --model + --view): every
// relationship attachment view.yaml declares (e.g. the SSL padlock badges on
// user-cdn / user-web-elb in examples/showcase/1-cloud-web-app) must
// actually be visible in the SVG: a <use> whose href resolves to the
// attachment's expected <symbol> must sit somewhere inside the element
// group carrying the matching data-relationship="<relationship id>"
// attribute — final.svg's edge-attachment binding convention (see that
// file's "SSL padlock badges" comment). checkViewRefUnresolved validates
// the same attachments' *shape* (icon/anchor/offset) but, by design,
// doesn't render-bind relationship attachments the way it does for
// components/visual-elements (see its doc comment) — this check is that
// render binding, kept separate so a component-side rendering defect and an
// edge-side one are never reported under the same id.
//
// Two ways an attachment fails here, both reported identically (from this
// relationship's point of view its glyph is simply not where declared):
//   - absent:     no node carries data-relationship="<id>" at all, or none
//                 of that node's descendants is a matching <use>.
//   - wrong-edge: the <use> exists, but only inside a DIFFERENT
//                 relationship's data-relationship group — this
//                 relationship's own group (if any) still has none.
//
// A relationship id that doesn't resolve into model.yaml, or an attachment
// whose own shape is invalid (not an object, non-string icon), is left to
// VIEW_REF_UNRESOLVED to report — skipped here to avoid a duplicate report
// of the same root cause.
function checkRelationshipAttachmentNotRendered(root, model, view) {
  const relationshipIds = new Set((model.relationships ?? []).map((r) => String(r.id)));
  const dataRelationshipNodes = collectDataAttrNodes(root, 'data-relationship');

  const declared = Object.entries(view.relationships ?? {}).filter(([id]) =>
    relationshipIds.has(id),
  );
  if (declared.length === 0) {
    return {
      status: 'NOT-CHECKABLE',
      message:
        'view.yaml declares no relationship attachments that resolve into a model.yaml relationship id',
    };
  }

  const problems = [];
  let checkedAttachments = 0;
  for (const [id, attachments] of declared) {
    if (!Array.isArray(attachments)) continue;
    attachments.forEach((attachment, index) => {
      if (
        !attachment ||
        typeof attachment !== 'object' ||
        typeof attachment.icon !== 'string' ||
        attachment.icon.length === 0
      ) {
        return; // malformed shape — VIEW_REF_UNRESOLVED already reports this
      }
      checkedAttachments += 1;
      const expectedSymbol = svgSymbolIdForIcon(attachment.icon);
      const nodes = dataRelationshipNodes.get(id) ?? [];
      const rendered = nodes.some((anchorNode) =>
        collectDescendants(anchorNode, 'use').some((u) => useHrefTarget(u) === expectedSymbol),
      );
      if (!rendered) {
        problems.push(
          `relationship "${id}" attachment[${index}] declares icon "${attachment.icon}" ` +
            `(expects a <use href="#${expectedSymbol}">) but none was found inside the ` +
            `element group carrying data-relationship="${id}" (${nodes.length} such group(s) found)`,
        );
      }
    });
  }

  if (checkedAttachments === 0) {
    return {
      status: 'NOT-CHECKABLE',
      message:
        'every relationship attachment in view.yaml has an invalid shape (see VIEW_REF_UNRESOLVED)',
    };
  }
  if (problems.length > 0) {
    return {
      status: 'FAIL',
      message: `RELATIONSHIP_ATTACHMENT_NOT_RENDERED: ${problems.length} problem(s), e.g. ${problems[0]}`,
    };
  }
  return {
    status: 'PASS',
    message: `${checkedAttachments} relationship attachment(s) in view.yaml each have a matching <use> rendered inside their data-relationship group`,
  };
}

// Every element under root carrying `attrName` -> how many times each value
// occurs (an id should occur exactly once; more than once is as much a
// defect as zero times).
function collectDataAttrCounts(root, attrName) {
  const counts = new Map();
  (function walk(n) {
    for (const c of n.children) {
      const v = c.attrs && c.attrs[attrName];
      if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
      walk(c);
    }
  })(root);
  return counts;
}

// UNTRACEABLE_VISUAL / MISSING_COMPONENT (requires --model; --view extends
// it to also check data-view-element <-> view.yaml visualElements):
//   MISSING_COMPONENT  - a model.yaml component (or, with --view, a
//                         visualElements entry) does not appear via its
//                         data-component/data-view-element attribute in the
//                         SVG exactly once.
//   UNTRACEABLE_VISUAL - a data-component/data-view-element value present in
//                         the SVG does not resolve back to a known id.
function checkUntraceableVisual(root, model, view) {
  const missing = [];
  const untraceable = [];

  const componentIds = new Set((model.components ?? []).map((c) => String(c.id)));
  const seenComponent = collectDataAttrCounts(root, 'data-component');
  for (const id of componentIds) {
    const count = seenComponent.get(id) ?? 0;
    if (count !== 1) missing.push({ id, count, attr: 'data-component' });
  }
  for (const id of seenComponent.keys())
    if (!componentIds.has(id)) untraceable.push({ id, attr: 'data-component' });

  if (view) {
    const elementIds = new Set((view.visualElements ?? []).map((e) => String(e.id)));
    const seenViewElement = collectDataAttrCounts(root, 'data-view-element');
    for (const id of elementIds) {
      const count = seenViewElement.get(id) ?? 0;
      if (count !== 1) missing.push({ id, count, attr: 'data-view-element' });
    }
    for (const id of seenViewElement.keys())
      if (!elementIds.has(id)) untraceable.push({ id, attr: 'data-view-element' });
  }

  if (missing.length > 0) {
    const m = missing[0];
    return {
      status: 'FAIL',
      message:
        `MISSING_COMPONENT: ${missing.length} id(s) do not appear exactly once via their ` +
        `attribute in the SVG, e.g. "${m.id}" appears ${m.count} time(s) via ${m.attr} (expected 1)`,
    };
  }
  if (untraceable.length > 0) {
    const u = untraceable[0];
    return {
      status: 'FAIL',
      message: `UNTRACEABLE_VISUAL: ${untraceable.length} ${u.attr} value(s) in the SVG do not resolve to a known id, e.g. "${u.id}"`,
    };
  }
  const viewNote = view
    ? `; ${(view.visualElements ?? []).length} view visual-element id(s) each appear exactly once via data-view-element`
    : '';
  return {
    status: 'PASS',
    message: `${componentIds.size} model component id(s) each appear exactly once via data-component${viewNote}`,
  };
}

// Resolves every layout.json node's absolute-canvas center, following
// parentId chains (a non-root-parented node's x/y is relative to its
// parent's origin — see README.md "Coordinate convention in layout.json").
// Returns null for a node whose parent chain doesn't resolve (unknown
// parent, or a cycle) rather than guessing.
function resolveLayoutCenters(layout) {
  const byId = new Map((layout.nodes ?? []).map((n) => [n.id, n]));
  const originCache = new Map();
  function origin(id, seen) {
    if (originCache.has(id)) return originCache.get(id);
    const node = byId.get(id);
    if (!node || seen.has(id)) return null;
    seen.add(id);
    let result;
    if (node.parentId === null || node.parentId === undefined) {
      result = { x: node.x, y: node.y };
    } else {
      const parentOrigin = origin(node.parentId, seen);
      result = parentOrigin ? { x: parentOrigin.x + node.x, y: parentOrigin.y + node.y } : null;
    }
    originCache.set(id, result);
    return result;
  }
  const centers = new Map();
  for (const node of byId.values()) {
    const o = origin(node.id, new Set());
    if (o) centers.set(node.id, { x: o.x + node.width / 2, y: o.y + node.height / 2 });
  }
  return centers;
}

const DIRECTION_AXIS = {
  up: { key: 'y', sign: -1 },
  down: { key: 'y', sign: 1 },
  left: { key: 'x', sign: -1 },
  right: { key: 'x', sign: 1 },
};
export const DIRECTION_GEOMETRY_THRESHOLD = 0.6;

// DIRECTION_GEOMETRY_CONFLICT (requires --model, --view, --layout): for each
// model.yaml relationship, the net displacement (layout.json node center,
// target minus source) along the axis view.yaml's flow.direction names must
// be POSITIVE in that direction for at least DIRECTION_GEOMETRY_THRESHOLD of
// relationships. "mixed" skips the check entirely (no single dominant
// direction to check against). A same-row/same-column edge (net
// displacement 0 on that axis) counts toward the denominator but not the
// numerator — it neither confirms nor conflicts.
//
// LAYOUT_INCOMPLETE (blocking, computed before the ratio): every model.yaml
// relationship's endpoints must resolve to a layout.json node — an
// unresolved endpoint used to be silently dropped from the denominator,
// which let a near-empty layout.json (most nodes missing) score against
// only the handful of relationships it happened to cover and pass at 100%
// while saying nothing about the rest of the diagram. That's now a hard
// FAIL, not a skip. Duplicate layout.json node ids are checked first and
// are also a hard FAIL: resolveLayoutCenters silently lets a later
// duplicate clobber an earlier one's center, which would make the
// completeness check itself unreliable.
function checkDirectionGeometryConflict(model, view, layout) {
  const direction = view?.flow?.direction;
  if (!direction) return { status: 'NOT-CHECKABLE', message: 'view.yaml has no flow.direction' };
  if (direction === 'mixed')
    return { status: 'NOT-CHECKABLE', message: 'flow.direction is "mixed" — check skipped' };
  const axis = DIRECTION_AXIS[direction];
  if (!axis)
    return {
      status: 'NOT-CHECKABLE',
      message: `flow.direction "${direction}" is not one of up/down/left/right/mixed`,
    };

  const nodeIdCounts = new Map();
  for (const n of layout.nodes ?? []) nodeIdCounts.set(n.id, (nodeIdCounts.get(n.id) ?? 0) + 1);
  const duplicateIds = [...nodeIdCounts].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicateIds.length > 0) {
    return {
      status: 'FAIL',
      message: `LAYOUT_INCOMPLETE: layout.json has ${duplicateIds.length} duplicate node id(s): ${duplicateIds.join(', ')}`,
    };
  }

  const centers = resolveLayoutCenters(layout);
  const relationships = model.relationships ?? [];
  if (relationships.length === 0)
    return { status: 'NOT-CHECKABLE', message: 'model.yaml has no relationships' };

  const unresolved = [];
  let compliant = 0;
  let firstOffender = null;
  for (const rel of relationships) {
    const from = centers.get(rel.from);
    const to = centers.get(rel.to);
    if (!from || !to) {
      unresolved.push({
        id: rel.id,
        from: rel.from,
        to: rel.to,
        fromOk: Boolean(from),
        toOk: Boolean(to),
      });
      continue;
    }
    const raw = axis.key === 'y' ? to.y - from.y : to.x - from.x;
    const delta = raw * axis.sign;
    if (delta > 0) compliant += 1;
    else if (!firstOffender) firstOffender = rel.id;
  }
  if (unresolved.length > 0) {
    const u = unresolved[0];
    const badSide = !u.fromOk ? `from "${u.from}"` : `to "${u.to}"`;
    return {
      status: 'FAIL',
      message:
        `LAYOUT_INCOMPLETE: ${unresolved.length}/${relationships.length} model.yaml relationship(s) have ` +
        `an endpoint that does not resolve to a layout.json node, e.g. relationship "${u.id}" ${badSide}`,
    };
  }

  const considered = relationships.length;
  const fraction = compliant / considered;
  const pct = (n) => `${Math.round(n * 100)}%`;
  if (fraction < DIRECTION_GEOMETRY_THRESHOLD) {
    return {
      status: 'FAIL',
      message:
        `DIRECTION_GEOMETRY_CONFLICT: flow.direction="${direction}" but only ${compliant}/${considered} ` +
        `relationship(s) (${pct(fraction)}) have a net displacement matching that direction ` +
        `(threshold ${pct(DIRECTION_GEOMETRY_THRESHOLD)}), e.g. ${firstOffender}`,
    };
  }
  return {
    status: 'PASS',
    message: `${compliant}/${considered} relationship(s) (${pct(fraction)}) have a net displacement matching flow.direction="${direction}" (>= ${pct(DIRECTION_GEOMETRY_THRESHOLD)} required)`,
  };
}

// Every mxCell in source.xml that is a vertex or an edge -> { id, kind }.
// Same "not a real XML parser" tradeoff as the SVG tokenizer above: a flat
// regex scan over well-formed, generator-produced drawio XML, not a DOM
// walk. Sound for this format because drawio always HTML-entity-escapes
// literal '>' inside attribute values (`&gt;`), so a naive `[^>]*` capture
// of the attribute string never runs past the real tag boundary.
function parseSourceMxCells(sourceXmlText) {
  const cells = [];
  const re = /<mxCell\b([^>]*)>/g;
  let m;
  while ((m = re.exec(sourceXmlText))) {
    const attrs = parseAttrs(m[1]);
    if (attrs.id === undefined) continue;
    if (attrs.vertex === '1') cells.push({ id: attrs.id, kind: 'vertex' });
    else if (attrs.edge === '1') cells.push({ id: attrs.id, kind: 'edge' });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Mermaid source parsing (census `source:` files ending in .mmd). Two
// dialects, dispatched on the first non-blank/non-comment line: flowchart
// (`graph`/`flowchart` + node defs + `-->`/`-.->`/`==>` edges +
// `subgraph`/`end` blocks) and C4 (`C4Container`/`C4Context`/etc + element
// macros like `Person(...)`/`Container(...)` + `Rel`/`Rel_Back` edges).
// Same "not a real grammar" tradeoff as parseSourceMxCells above: a
// line-oriented regex scan tuned to what these showcase sources actually
// use, not a full mermaid parser -- unrecognized syntax is silently
// skipped (not guessed at) rather than crashing.
//
// Element rules (see the task that introduced this, and diagram-rules.md's
// census section, for the authoring contract these ids feed):
//   - every declared node id is a vertex.
//   - every subgraph block (flowchart) / boundary or element macro call
//     (C4) is a vertex -- it is a drawable element census.yaml must
//     account for.
//   - every edge line/macro is an edge, with a stable synthesized id
//     `edge:<from>-><to>[:n]` (n disambiguates parallel duplicates of the
//     same from/to pair; the first occurrence carries no suffix).
//   - an edge's label is part of the edge, not a separate element.
//   - comments (%%) and non-drawing directives (mermaid init blocks,
//     `graph`/`flowchart` direction, `accTitle`/`accDescr`, C4 `title`,
//     C4 layout/style directives like `UpdateRelStyle`/`UpdateLayoutConfig`)
//     are not elements.
// ---------------------------------------------------------------------------

// Assigns the synthesized edge id for the n-th edge sharing a given
// (from, to) pair -- "edge:<from>-><to>" for the first, "...:2", "...:3", …
// for later duplicates. `edgeCounts` is mutated (one Map shared across an
// entire source parse).
function synthesizeEdgeId(edgeCounts, from, to) {
  const key = `${from}->${to}`;
  const n = (edgeCounts.get(key) ?? 0) + 1;
  edgeCounts.set(key, n);
  return n === 1 ? `edge:${key}` : `edge:${key}:${n}`;
}

// Strips a flowchart node token's shape delimiters down to its bare id:
// "A[Producer]" -> "A", "B(message)" -> "B", "deploy_a" -> "deploy_a".
// Mermaid node ids are [A-Za-z0-9_-]+.
function bareMermaidNodeId(token) {
  const m = /^([A-Za-z0-9_-]+)/.exec(token.trim());
  return m ? m[1] : token.trim();
}

// Flowchart/graph dialect (`graph TD`/`flowchart LR`, …).
const MERMAID_ARROW_RE = /-\.->|==>|-->/;

function parseMermaidFlowchartSource(text) {
  const elements = [];
  const seenVertex = new Set();
  const edgeCounts = new Map();

  function addVertex(id) {
    if (!seenVertex.has(id)) {
      seenVertex.add(id);
      elements.push({ id, kind: 'vertex' });
    }
  }
  function addEdge(from, to) {
    addVertex(from);
    addVertex(to);
    elements.push({ id: synthesizeEdgeId(edgeCounts, from, to), kind: 'edge' });
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('%%')) continue; // blank / comment / init directive
    if (/^(graph|flowchart)\s+/i.test(line)) continue; // direction directive
    if (/^acc(Title|Descr)\s*:/i.test(line)) continue; // accessibility metadata

    const subgraphMatch = /^subgraph\s+(.+)$/i.exec(line);
    if (subgraphMatch) {
      const header = subgraphMatch[1].trim();
      // "subgraph id [Title]" form vs. bare-title form, where mermaid uses
      // the title text itself as the (auto-generated) id -- see
      // diagram-rules.md's census section for why the raw header text is
      // kept as-is rather than slugified: it's what a census author reads
      // back off --census-dump and writes into source_id.
      const bracketMatch = /^([A-Za-z0-9_-]+)\s*\[(.+)\]$/.exec(header);
      addVertex(bracketMatch ? bracketMatch[1] : header);
      continue;
    }
    if (/^end$/i.test(line)) continue; // closes a subgraph block -- not an element

    if (MERMAID_ARROW_RE.test(line)) {
      const ids = line
        .split(MERMAID_ARROW_RE)
        .map((part) => bareMermaidNodeId(part.replace(/^\|[^|]*\|\s*/, '')));
      for (let i = 0; i + 1 < ids.length; i += 1) addEdge(ids[i], ids[i + 1]);
      continue;
    }

    // A bare node declaration with no edge on this line.
    const bareMatch = /^([A-Za-z0-9_-]+)\s*(\[.*\]|\(\(.*\)\)|\(.*\)|\{.*\})?\s*$/.exec(line);
    if (bareMatch) addVertex(bareMatch[1]);
    // Anything else (unrecognized syntax) is silently skipped.
  }

  return elements;
}

// C4 dialect (`C4Container`/`C4Context`/`C4Component`/`C4Dynamic`/
// `C4Deployment`). Every macro call is a vertex (id = first arg) EXCEPT
// `Rel`/`Rel_Back`, which are edges (`Rel_Back` reverses the declared
// from/to into the actual edge direction), and any macro starting with
// "Update" (UpdateRelStyle/UpdateElementStyle/UpdateLayoutConfig/…), which
// are layout/style directives, not elements.
const C4_HEADER_RE = /^C4(Container|Context|Component|Dynamic|Deployment)\b/;
const C4_REL_CALL_RE = /^(Rel|Rel_Back)\s*\(\s*([A-Za-z0-9_.-]+)\s*,\s*([A-Za-z0-9_.-]+)/;
const C4_MACRO_CALL_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([A-Za-z0-9_.-]+)/;

function parseMermaidC4Source(text) {
  const elements = [];
  const seenVertex = new Set();
  const edgeCounts = new Map();

  function addVertex(id) {
    if (!seenVertex.has(id)) {
      seenVertex.add(id);
      elements.push({ id, kind: 'vertex' });
    }
  }
  function addEdge(from, to) {
    addVertex(from);
    addVertex(to);
    elements.push({ id: synthesizeEdgeId(edgeCounts, from, to), kind: 'edge' });
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('%%')) continue; // blank / comment
    if (C4_HEADER_RE.test(line)) continue; // diagram-type directive
    if (/^title\b/.test(line)) continue; // C4 title directive
    if (/^[{}]$/.test(line)) continue; // bare Boundary block brace

    const relMatch = C4_REL_CALL_RE.exec(line);
    if (relMatch) {
      const [, macro, argA, argB] = relMatch;
      if (macro === 'Rel_Back') addEdge(argB, argA);
      else addEdge(argA, argB);
      continue;
    }

    const callMatch = C4_MACRO_CALL_RE.exec(line);
    if (callMatch) {
      const [, macro, id] = callMatch;
      if (/^Update/.test(macro)) continue; // layout/style directive, not an element
      addVertex(id);
      continue;
    }
    // Anything else (a Boundary block's closing brace on its own line,
    // unrecognized syntax) is silently skipped.
  }

  return elements;
}

// Dispatches on the first non-blank/non-comment line: a C4 diagram-type
// header selects the C4 dialect, everything else falls back to
// flowchart/graph (the only two dialects the showcase sources use today).
export function parseMermaidSourceElements(text) {
  const firstMeaningfulLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== '' && !l.startsWith('%%'));
  if (firstMeaningfulLine && C4_HEADER_RE.test(firstMeaningfulLine)) {
    return parseMermaidC4Source(text);
  }
  return parseMermaidFlowchartSource(text);
}

// Dispatches a census `source:` file to the right parser by extension: a
// .mmd source uses parseMermaidSourceElements (flowchart or C4 dialect),
// anything else is assumed to be drawio XML and uses parseSourceMxCells --
// same contract, { id, kind: 'vertex' | 'edge' }[], either way, so
// checkCensusMismatch below doesn't need to know which dialect it got.
function parseSourceElements(sourceText, sourcePath) {
  if (/\.mmd$/i.test(sourcePath)) return parseMermaidSourceElements(sourceText);
  return parseSourceMxCells(sourceText);
}

const CENSUS_PRIMARY_BUCKETS = new Set(['component', 'relationship', 'token', 'visual', 'drop']);

// CENSUS_MISMATCH (requires --census; --model additionally enables
// component/relationship/token target-id resolvability, --view additionally
// enables visual target-id resolvability): census.yaml's `source` field
// names the raw diagram source (resolved relative to census.yaml's own
// directory), parsed by parseSourceElements above -- drawio mxCells for a
// .xml source, flowchart/C4 nodes+edges for a .mmd one. Its vertex+edge ids
// must map ONE-TO-ONE onto census.yaml's records — every source_id in
// records must exist exactly once (no duplicates, no unknown ids) and
// every source vertex/edge id must have exactly one record (no missing
// ids); this used to be checked as a
// bare count comparison, which a census that duplicated one id enough times
// to match the total (e.g. all records pointing at the same source_id)
// could pass while covering almost nothing. Each record's `kind` must match
// its source cell's kind, and `primary_bucket` must be one of the five
// closed values. target_ids are then validated per bucket:
//   component/relationship -> must resolve into model.yaml's matching list.
//   visual                 -> must resolve into view.yaml's visualElements.
//   token                  -> target_ids mixes a token ref (e.g.
//                              "security:security.encryption.in-transit")
//                              with the model component/relationship id(s)
//                              it's carried by (see census.yaml's own
//                              source_id 40 for the real shape this takes);
//                              every non-token-ref entry must resolve into
//                              model.yaml, and every token-ref entry must
//                              actually appear in the tokens list of at
//                              least one of those resolved elements.
//   drop                   -> target_ids must be empty and reason required.
function checkCensusMismatch(census, censusFilePath, model, view) {
  const problems = [];
  const records = census.records ?? [];

  let sourceCells = null;
  if (census.source) {
    const sourcePath = path.resolve(path.dirname(censusFilePath), census.source);
    let sourceText;
    try {
      sourceText = readFileSync(sourcePath, 'utf8');
    } catch (cause) {
      return {
        status: 'FAIL',
        message: `CENSUS_MISMATCH: could not read census source "${census.source}" (resolved ${sourcePath}): ${cause instanceof Error ? cause.message : String(cause)}`,
      };
    }
    sourceCells = parseSourceElements(sourceText, sourcePath);
  }

  if (sourceCells) {
    const bySourceId = new Map(sourceCells.map((c) => [c.id, c]));
    const recordIdCounts = new Map();
    for (const rec of records) {
      if (rec.source_id === undefined || rec.source_id === null) {
        problems.push('a census record is missing source_id');
        continue;
      }
      const sid = String(rec.source_id);
      recordIdCounts.set(sid, (recordIdCounts.get(sid) ?? 0) + 1);
    }
    for (const [sid, count] of recordIdCounts) {
      if (count > 1)
        problems.push(`source_id "${sid}" appears ${count} times in census.yaml (duplicate)`);
      if (!bySourceId.has(sid))
        problems.push(
          `source_id "${sid}" does not correspond to any vertex/edge mxCell in "${census.source}"`,
        );
    }
    for (const [sid, cell] of bySourceId) {
      if (!recordIdCounts.has(sid))
        problems.push(
          `source element "${sid}" (${cell.kind}) in "${census.source}" has no census record`,
        );
    }
    for (const rec of records) {
      if (rec.source_id === undefined || rec.source_id === null) continue;
      const cell = bySourceId.get(String(rec.source_id));
      if (cell && rec.kind !== cell.kind) {
        problems.push(
          `census record ${rec.source_id} declares kind "${rec.kind}" but the source cell is "${cell.kind}"`,
        );
      }
    }
  }

  for (const rec of records) {
    if (!CENSUS_PRIMARY_BUCKETS.has(rec.primary_bucket)) {
      problems.push(
        `census record ${rec.source_id} has primary_bucket ${JSON.stringify(rec.primary_bucket)}, not one of ${[...CENSUS_PRIMARY_BUCKETS].join('/')}`,
      );
    }
  }

  const componentIds = model ? new Set((model.components ?? []).map((c) => String(c.id))) : null;
  const relationshipIds = model
    ? new Set((model.relationships ?? []).map((r) => String(r.id)))
    : null;
  const visualElementIds = view
    ? new Set((view.visualElements ?? []).map((e) => String(e.id)))
    : null;

  for (const rec of records) {
    const targetIds = (rec.target_ids ?? []).map(String);
    if (rec.primary_bucket === 'component' && componentIds) {
      for (const t of targetIds)
        if (!componentIds.has(t))
          problems.push(
            `census record ${rec.source_id} (component) targets "${t}", not found in model.yaml`,
          );
    } else if (rec.primary_bucket === 'relationship' && relationshipIds) {
      for (const t of targetIds)
        if (!relationshipIds.has(t))
          problems.push(
            `census record ${rec.source_id} (relationship) targets "${t}", not found in model.yaml`,
          );
    } else if (rec.primary_bucket === 'visual' && visualElementIds) {
      for (const t of targetIds)
        if (!visualElementIds.has(t))
          problems.push(
            `census record ${rec.source_id} (visual) targets "${t}", not found in view.yaml visualElements`,
          );
    } else if (rec.primary_bucket === 'token' && componentIds && relationshipIds) {
      const modelIdTargets = targetIds.filter((t) => componentIds.has(t) || relationshipIds.has(t));
      const tokenRefTargets = targetIds.filter(
        (t) => !componentIds.has(t) && !relationshipIds.has(t),
      );
      if (modelIdTargets.length === 0) {
        problems.push(
          `census record ${rec.source_id} (token) has no linked model component/relationship id in target_ids`,
        );
      }
      for (const tokenRef of tokenRefTargets) {
        const carried = modelIdTargets.some((linkedId) => {
          const el =
            (model.components ?? []).find((c) => String(c.id) === linkedId) ??
            (model.relationships ?? []).find((r) => String(r.id) === linkedId);
          return el && (el.tokens ?? []).some((t) => t.token === tokenRef);
        });
        if (!carried) {
          problems.push(
            `census record ${rec.source_id} (token) target "${tokenRef}" is not a token on any of its ` +
              `linked model element(s) (${modelIdTargets.join(', ') || 'none'})`,
          );
        }
      }
    } else if (rec.primary_bucket === 'drop') {
      if (targetIds.length > 0)
        problems.push(
          `census record ${rec.source_id} has primary_bucket=drop but non-empty target_ids`,
        );
      if (!(rec.reason && String(rec.reason).trim()))
        problems.push(`census record ${rec.source_id} has primary_bucket=drop but no reason`);
    }
  }

  if (problems.length > 0)
    return { status: 'FAIL', message: `CENSUS_MISMATCH: ${problems.join('; ')}` };
  // The bijection against source.xml is this check's core purpose (its own
  // name is CENSUS_MISMATCH); a census.yaml with no `source` field can still
  // pass every per-record validation above without that ever having been
  // verified. Reported as NOT-CHECKABLE rather than a silent PASS so --full
  // (which promotes NOT-CHECKABLE cross-layer results to FAIL) can see it.
  if (!sourceCells) {
    return {
      status: 'NOT-CHECKABLE',
      message: `census.yaml has no \`source\` field — record/source bijection not checked (${records.length} record(s) otherwise valid)`,
    };
  }
  const notes = [];
  notes.push(`bijects onto ${sourceCells.length} source element(s) in "${census.source}"`);
  notes.push(
    model
      ? 'every component/relationship/token target_id resolves into model.yaml'
      : 'target_id resolvability not checked for component/relationship/token — no --model given',
  );
  notes.push(
    view
      ? 'every visual target_id resolves into view.yaml'
      : 'target_id resolvability not checked for visual — no --view given',
  );
  return {
    status: 'PASS',
    message: `${records.length} census record(s): ${notes.join('; ')}; every drop carries a reason and no target_ids`,
  };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

function lintSource(text, label, crossLayer = {}) {
  const { comments, stripped } = extractComments(text);
  const root = buildTree(stripped);
  const allCommentsText = comments.join('\n');

  const checkResults = new Map([
    ['4', checkRule4(root)],
    ['3a', checkRule3a(root)],
    ['7', checkRule7(root)],
    ['8', checkRule8(root)],
    ['9', checkRule9(root)],
    ['10', checkRule10(root, allCommentsText)],
    ['C1', checkC1(root, comments)],
    ['B4', checkB4(root)],
    ['B2-lite', checkB2Lite(root)],
    ['T2-lite', checkT2Lite(root)],
  ]);

  const { model, view, census, censusFilePath, layout, full } = crossLayer;
  if (view) checkResults.set('UNKNOWN_ICON_SYMBOL', checkUnknownIconSymbol(root, view));
  if (model)
    checkResults.set(
      'UNTRACEABLE_VISUAL / MISSING_COMPONENT',
      checkUntraceableVisual(root, model, view),
    );
  if (model && view)
    checkResults.set('VIEW_REF_UNRESOLVED', checkViewRefUnresolved(root, model, view));
  if (model && view)
    checkResults.set(
      'RELATIONSHIP_ATTACHMENT_NOT_RENDERED',
      checkRelationshipAttachmentNotRendered(root, model, view),
    );
  if (model && view && layout)
    checkResults.set(
      'DIRECTION_GEOMETRY_CONFLICT',
      checkDirectionGeometryConflict(model, view, layout),
    );
  if (census)
    checkResults.set('CENSUS_MISMATCH', checkCensusMismatch(census, censusFilePath, model, view));

  // --full is the full-gate mode: a cross-layer check that couldn't reach a
  // definitive answer (NOT-CHECKABLE) is promoted to FAIL rather than left
  // as a pass-through. This applies ONLY to the cross-layer checks above —
  // the baseline render-dependent/out-of-scope rule ids below stay
  // NOT-CHECKABLE regardless of --full; those are permanently outside this
  // tool's reach (see the file header), not a gap --full is meant to close.
  if (full) {
    for (const id of CROSS_LAYER_CHECK_IDS) {
      const result = checkResults.get(id);
      if (result && result.status === 'NOT-CHECKABLE') {
        checkResults.set(id, {
          status: 'FAIL',
          message: `FULL_GATE_NOT_CHECKABLE: --full requires a definitive answer; ${id} was NOT-CHECKABLE: ${result.message}`,
        });
      }
    }
  }

  const checks = [];
  for (const [id, result] of checkResults) {
    checks.push({ id, ...result });
  }
  for (const id of RENDER_DEPENDENT_IDS) {
    checks.push({
      id,
      status: 'NOT-CHECKABLE',
      message: 'render-dependent — not evaluated by this tool',
    });
  }
  for (const id of OUT_OF_SCOPE_IDS) {
    checks.push({
      id,
      status: 'NOT-CHECKABLE',
      message:
        'not implemented — needs semantic/typographic judgement beyond mechanical SVG inspection',
    });
  }
  checks.sort((a, b) => ruleSortKey(a.id) - ruleSortKey(b.id) || a.id.localeCompare(b.id));

  const summary = { PASS: 0, FAIL: 0, WARN: 0, 'NOT-CHECKABLE': 0 };
  for (const c of checks) summary[c.status] += 1;

  return { file: label, checks, summary, ok: summary.FAIL === 0 };
}

// Sort connector rules (numeric) before box/color/text rules (alpha), each
// group in natural order — purely cosmetic, for a stable/readable report.
// Cross-layer check ids (not all-digit, don't start with a rule letter we
// special-cased) just sort after everything else by their own charCode,
// which is fine — order here is cosmetic, not meaningful.
function ruleSortKey(id) {
  if (/^\d+$/.test(id)) return Number.parseInt(id, 10);
  if (id === '3a') return 3.5;
  return 1000 + id.charCodeAt(0) * 10 + (id.includes('-lite') ? 0.5 : 0);
}

function lintFile(filePath, crossLayer) {
  const text = readFileSync(filePath, 'utf8');
  return lintSource(text, filePath, crossLayer);
}

function formatHuman(result) {
  const lines = [`${result.file}`];
  for (const c of result.checks) {
    const badge = c.status.padEnd(14, ' ');
    lines.push(`  [${badge}] ${c.id}: ${c.message}`);
    if (c.snippet) lines.push(`      snippet: ${c.snippet}`);
  }
  lines.push(
    `  -> ${result.summary.PASS} PASS, ${result.summary.FAIL} FAIL, ${result.summary.WARN} WARN, ${result.summary['NOT-CHECKABLE']} NOT-CHECKABLE`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage:
  node tools/rules-lint.mjs <file.svg> [more.svg...] [--format human|json]
  node tools/rules-lint.mjs <file.svg> [--model model.yaml] [--view view.yaml] [--census census.yaml] [--layout layout.json] [--format human|json]
  node tools/rules-lint.mjs <file.svg> --full --model model.yaml --view view.yaml --census census.yaml --layout layout.json [--format human|json]
  node tools/rules-lint.mjs --census-dump <source.xml|source.mmd> [--format human|json]
  node tools/rules-lint.mjs --help

--census-dump is a standalone mode: it parses ONE raw diagram source (a
census.yaml's own \`source\` file, before census.yaml exists) with the same
parser CENSUS_MISMATCH below uses -- drawio mxCells for .xml, flowchart or
C4 nodes+edges for .mmd -- and prints every { id, kind } element it found,
so a census.yaml author has the exact source_id inventory to write records
against. It cannot be combined with <file.svg> positional arguments.

--model/--view/--census/--layout are each optional, and together they
require exactly one <file.svg> (they describe ONE example, unlike the plain
per-file SVG rule checks, which accept any number of files with no flags).
A cross-layer check only runs when ALL of the flags it needs are supplied:

  UNKNOWN_ICON_SYMBOL               needs --view. Every icon id referenced
                                     in view.yaml's components/relationships
                                     attachments must resolve to a
                                     <symbol id="icon-<id>"> in the SVG defs
                                     (id maps by replacing "." with "-");
                                     an SVG <symbol> no attachment uses is
                                     reported as WARN, not FAIL.
  UNTRACEABLE_VISUAL /
  MISSING_COMPONENT                 needs --model (add --view to also check
                                     data-view-element against view.yaml's
                                     visualElements). Every model.yaml
                                     component id must appear via
                                     data-component in the SVG exactly once,
                                     and every data-component/
                                     data-view-element value in the SVG must
                                     resolve back to a known id.
  VIEW_REF_UNRESOLVED               needs --model and --view. Every
                                     view.yaml components/relationships key
                                     must resolve to a model.yaml
                                     component/relationship id, every
                                     visualElements[].members entry must
                                     resolve to a model.yaml component id,
                                     every attachment's shape must be valid
                                     (icon: string; anchor: a nine-grid
                                     position or "edge-midpoint"; offset only
                                     alongside "edge-midpoint"), and every
                                     declared component/view-element icon
                                     attachment must be rendered as a <use>
                                     inside the element group carrying the
                                     matching data-component/
                                     data-view-element (ATTACHMENT_NOT_RENDERED
                                     otherwise; relationship attachments are
                                     shape-checked only — this SVG format has
                                     no data-relationship anchor to bind
                                     them to).
  DIRECTION_GEOMETRY_CONFLICT       needs --model, --view, and --layout.
                                     Every model.yaml relationship's
                                     endpoints must first resolve to a
                                     layout.json node (LAYOUT_INCOMPLETE
                                     otherwise, and duplicate layout.json
                                     node ids are also LAYOUT_INCOMPLETE);
                                     then, for each relationship, computes
                                     the net displacement between its
                                     endpoints' layout.json node centers —
                                     if view.yaml's flow.direction is one of
                                     up/down/left/right, at least
                                     ${Math.round(DIRECTION_GEOMETRY_THRESHOLD * 100)}% of relationships must have a net
                                     displacement matching that direction.
                                     "mixed" skips the check.
  CENSUS_MISMATCH                   needs --census (add --model to check
                                     component/relationship/token target-id
                                     resolvability, --view to check visual
                                     target-id resolvability). census.yaml's
                                     records must map ONE-TO-ONE onto its own
                                     \`source\` file's vertex+edge ids --
                                     mxCells for a .xml source, flowchart or
                                     C4 nodes+edges for a .mmd source (see
                                     --census-dump above to inventory them)
                                     (source path resolved relative to
                                     census.yaml's own directory; no
                                     duplicate or unknown source_ids, no
                                     missing ones), each record's kind must
                                     match its source cell's kind,
                                     primary_bucket must be one of
                                     component/relationship/token/visual/drop,
                                     target_ids must resolve per that bucket,
                                     and every primary_bucket=drop record
                                     must carry a non-empty reason and no
                                     target_ids. A census.yaml with no
                                     \`source\` field is reported
                                     NOT-CHECKABLE (the bijection this check
                                     exists for was never verified), not a
                                     silent PASS.
  RELATIONSHIP_ATTACHMENT_NOT_RENDERED
                                     needs --model and --view. Every
                                     relationship attachment view.yaml
                                     declares (e.g. an SSL padlock badge)
                                     must render as a <use href="#icon-<id>">
                                     found inside the element group carrying
                                     the matching data-relationship="<id>"
                                     attribute in the SVG — absent, or bound
                                     to a different relationship's group
                                     (wrong-edge), is a FAIL either way. A
                                     relationship id or attachment shape
                                     VIEW_REF_UNRESOLVED already rejects is
                                     skipped here, not double-reported.

--full requires --model, --view, --census, and --layout together
(FULL_GATE_INCOMPLETE if any is missing) and additionally treats any
NOT-CHECKABLE result from the cross-layer checks above as a blocking FAIL
(FULL_GATE_NOT_CHECKABLE) rather than a pass-through — e.g. flow.direction:
mixed, which normally just skips DIRECTION_GEOMETRY_CONFLICT, fails under
--full. The always-render-dependent/out-of-scope baseline rule ids are
unaffected — they stay NOT-CHECKABLE even under --full.
`;

function parseArgs(argv) {
  const files = [];
  let format = 'human';
  let modelPath;
  let viewPath;
  let censusPath;
  let layoutPath;
  let full = false;
  let censusDumpPath;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    } else if (arg === '--format') {
      format = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
    } else if (arg === '--full') {
      full = true;
    } else if (arg === '--model' && argv[i + 1]) {
      modelPath = argv[i + 1];
      i += 1;
    } else if (arg === '--view' && argv[i + 1]) {
      viewPath = argv[i + 1];
      i += 1;
    } else if (arg === '--census' && argv[i + 1]) {
      censusPath = argv[i + 1];
      i += 1;
    } else if (arg === '--layout' && argv[i + 1]) {
      layoutPath = argv[i + 1];
      i += 1;
    } else if (arg === '--census-dump' && argv[i + 1]) {
      censusDumpPath = argv[i + 1];
      i += 1;
    } else {
      files.push(arg);
    }
  }
  if (format !== 'human' && format !== 'json')
    return { error: `Unknown --format: ${format}\n${USAGE}` };
  if (censusDumpPath) {
    if (files.length > 0 || modelPath || viewPath || censusPath || layoutPath || full)
      return {
        error: `--census-dump is a standalone mode and cannot be combined with <file.svg> positional arguments or --model/--view/--census/--layout/--full\n${USAGE}`,
      };
    return { format, censusDumpPath };
  }
  if (files.length === 0) return { error: USAGE };
  const anyCrossLayerFlag = Boolean(modelPath || viewPath || censusPath || layoutPath || full);
  if (anyCrossLayerFlag && files.length !== 1)
    return {
      error: `--model/--view/--census/--layout/--full require exactly one <file.svg> positional argument (got ${files.length})\n${USAGE}`,
    };
  return { files, format, modelPath, viewPath, censusPath, layoutPath, full };
}

// --census-dump output: the raw { id, kind } element list parseSourceElements
// produced for one source file, plus vertex/edge counts -- what a
// census.yaml author reads off to write source_id records against.
function formatCensusDump(elements, sourcePath, format) {
  const vertexCount = elements.filter((e) => e.kind === 'vertex').length;
  const edgeCount = elements.filter((e) => e.kind === 'edge').length;
  if (format === 'json') {
    return `${JSON.stringify({ source: sourcePath, vertexCount, edgeCount, elements }, null, 2)}\n`;
  }
  const lines = [sourcePath];
  for (const el of elements) lines.push(`  [${el.kind.padEnd(6, ' ')}] ${el.id}`);
  lines.push(`  -> ${vertexCount} vertex, ${edgeCount} edge, ${elements.length} total`);
  return `${lines.join('\n')}\n`;
}

// Exported so tests can drive the linter in-process (same pattern as
// tools/offline-generate.mjs's runOffline) instead of shelling out.
export async function runCli(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { exitCode: 0, stdout: USAGE, stderr: '' };
  if (parsed.error) return { exitCode: 2, stdout: '', stderr: parsed.error };

  if (parsed.censusDumpPath) {
    let sourceText;
    try {
      sourceText = readFileSync(parsed.censusDumpPath, 'utf8');
    } catch (cause) {
      return {
        exitCode: 2,
        stdout: '',
        stderr: `Could not read --census-dump source "${parsed.censusDumpPath}": ${cause instanceof Error ? cause.message : String(cause)}\n`,
      };
    }
    const elements = parseSourceElements(sourceText, parsed.censusDumpPath);
    return {
      exitCode: 0,
      stdout: formatCensusDump(elements, parsed.censusDumpPath, parsed.format),
      stderr: '',
    };
  }

  const { files, format, modelPath, viewPath, censusPath, layoutPath, full } = parsed;

  // Full-gate mode: --model/--view/--census/--layout are all required
  // together. This is reported as a FAIL result (not a usage error) so it
  // carries a named, machine-checkable code the same way every other
  // blocking condition in this tool does, rather than a bare exit-2 usage
  // dump.
  if (full) {
    const missingFlags = [
      !modelPath && '--model',
      !viewPath && '--view',
      !censusPath && '--census',
      !layoutPath && '--layout',
    ].filter(Boolean);
    if (missingFlags.length > 0) {
      const result = {
        file: files[0],
        checks: [
          {
            id: 'FULL_GATE',
            status: 'FAIL',
            message: `FULL_GATE_INCOMPLETE: --full requires --model, --view, --census, and --layout; missing: ${missingFlags.join(', ')}`,
          },
        ],
        summary: { PASS: 0, FAIL: 1, WARN: 0, 'NOT-CHECKABLE': 0 },
        ok: false,
      };
      const stdout =
        format === 'json' ? `${JSON.stringify([result], null, 2)}\n` : `${formatHuman(result)}\n`;
      return { exitCode: 1, stdout, stderr: '' };
    }
  }

  let model;
  let view;
  let census;
  let layout;
  try {
    if (modelPath) model = parseYaml(readFileSync(modelPath, 'utf8'));
    if (viewPath) view = parseYaml(readFileSync(viewPath, 'utf8'));
    if (censusPath) census = parseYaml(readFileSync(censusPath, 'utf8'));
    if (layoutPath) layout = JSON.parse(readFileSync(layoutPath, 'utf8'));
  } catch (cause) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `Could not read/parse cross-layer input: ${cause instanceof Error ? cause.message : String(cause)}\n`,
    };
  }
  const crossLayer = { model, view, census, censusFilePath: censusPath, layout, full };

  const results = [];
  for (const file of files) {
    let result;
    try {
      result = lintFile(file, crossLayer);
    } catch (cause) {
      return {
        exitCode: 2,
        stdout: '',
        stderr: `Could not read/parse ${file}: ${cause instanceof Error ? cause.message : String(cause)}\n`,
      };
    }
    results.push(result);
  }

  const anyFail = results.some((r) => !r.ok);
  const stdout =
    format === 'json'
      ? `${JSON.stringify(results, null, 2)}\n`
      : `${results.map(formatHuman).join('\n\n')}\n`;
  return { exitCode: anyFail ? 1 : 0, stdout, stderr: '' };
}

export { lintFile, lintSource, formatHuman };

async function main() {
  const { exitCode, stdout, stderr } = await runCli(process.argv.slice(2));
  process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exitCode = exitCode;
}

if (process.argv[1]?.endsWith('/rules-lint.mjs')) await main();
