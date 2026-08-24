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
//   rule 4    - no marker-ended <path> using C/S/Q bezier commands
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
//   CENSUS_MISMATCH                  census.yaml's record count vs.
//                                    source.xml's mxCell count, target-id
//                                    resolvability, and drop reasons.

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

// rule 4: no <path> with C/S/Q bezier commands used as a connector.
// Heuristic (per task brief): any marker-ended <path> whose `d` contains a
// C/S/Q command is a FAIL. A curved <path> with NO marker (a decorative
// icon glyph, e.g. a smiley on an actor icon) is out of scope for this
// rule — it isn't a connector — and is intentionally not flagged.
function checkRule4(root) {
  const paths = collectAll(root, 'path').filter((p) => !isInsideDefsOrMarker(p));
  const offenders = paths.filter((p) => hasMarkerRef(p.attrs) && /[csqCSQ]/.test(p.attrs.d || ''));
  if (offenders.length > 0) {
    return {
      status: 'FAIL',
      message: `${offenders.length} marker-ended <path> element(s) contain C/S/Q bezier commands (connectors must be <polyline>/<line>)`,
      snippet: truncate(offenders[0].raw),
    };
  }
  return {
    status: 'PASS',
    message: `no marker-ended <path> uses C/S/Q bezier commands (${paths.length} <path> element(s) scanned)`,
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

// rule 8: every connector (<polyline>/<line>) shares one stroke-width.
// stroke-width is resolved with SVG inheritance (own attribute, else
// nearest ancestor's) since several examples set it once on a wrapping
// <g> rather than per-element; falls back to the SVG default of 1.
function checkRule8(root) {
  const connectors = [...collectAll(root, 'polyline'), ...collectAll(root, 'line')].filter(
    (c) => !isInsideDefsOrMarker(c),
  );
  if (connectors.length === 0) {
    return { status: 'NOT-CHECKABLE', message: 'no <polyline>/<line> connector elements found' };
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
// relationships whose endpoints resolve. "mixed" skips the check entirely
// (no single dominant direction to check against). A same-row/same-column
// edge (net displacement 0 on that axis) counts toward the denominator but
// not the numerator — it neither confirms nor conflicts.
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
  const centers = resolveLayoutCenters(layout);
  const relationships = model.relationships ?? [];
  let considered = 0;
  let compliant = 0;
  let firstOffender = null;
  for (const rel of relationships) {
    const from = centers.get(rel.from);
    const to = centers.get(rel.to);
    if (!from || !to) continue;
    considered += 1;
    const raw = axis.key === 'y' ? to.y - from.y : to.x - from.x;
    const delta = raw * axis.sign;
    if (delta > 0) compliant += 1;
    else if (!firstOffender) firstOffender = rel.id;
  }
  if (considered === 0)
    return {
      status: 'NOT-CHECKABLE',
      message: 'no model.yaml relationship had both endpoints resolvable against layout.json nodes',
    };
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

function countSourceMxCells(sourceXmlText) {
  const vertexCount = (sourceXmlText.match(/<mxCell\b[^>]*\bvertex="1"/g) ?? []).length;
  const edgeCount = (sourceXmlText.match(/<mxCell\b[^>]*\bedge="1"/g) ?? []).length;
  return { vertexCount, edgeCount };
}

// CENSUS_MISMATCH (requires --census; --model additionally enables the
// target-id resolvability check): census.yaml's `source` field names the
// raw diagram source (resolved relative to census.yaml's own directory);
// its mxCell vertex+edge count must equal census.yaml's record count.
// Every component/relationship primary_bucket record's target_ids must
// resolve into model.yaml (skipped, not failed, when --model isn't given —
// this half of the check needs it to mean anything). Every drop record
// must carry a non-empty reason.
function checkCensusMismatch(census, censusFilePath, model) {
  const problems = [];
  const records = census.records ?? [];

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
    const { vertexCount, edgeCount } = countSourceMxCells(sourceText);
    const expectedTotal = vertexCount + edgeCount;
    if (records.length !== expectedTotal) {
      problems.push(
        `record count ${records.length} != source element count ${expectedTotal} (${vertexCount} vertex + ${edgeCount} edge, from "${census.source}")`,
      );
    }
  }

  if (model) {
    const componentIds = new Set((model.components ?? []).map((c) => String(c.id)));
    const relationshipIds = new Set((model.relationships ?? []).map((r) => String(r.id)));
    for (const rec of records) {
      const ids = rec.primary_bucket === 'component' ? componentIds : relationshipIds;
      if (rec.primary_bucket !== 'component' && rec.primary_bucket !== 'relationship') continue;
      for (const target of rec.target_ids ?? []) {
        if (!ids.has(String(target))) {
          problems.push(
            `census record ${rec.source_id} (${rec.primary_bucket}) targets "${target}", not found in model.yaml`,
          );
          break;
        }
      }
    }
  }

  for (const rec of records) {
    if (rec.primary_bucket === 'drop' && !(rec.reason && String(rec.reason).trim())) {
      problems.push(`census record ${rec.source_id} has primary_bucket=drop but no reason`);
    }
  }

  if (problems.length > 0)
    return { status: 'FAIL', message: `CENSUS_MISMATCH: ${problems.join('; ')}` };
  const modelNote = model
    ? '; every component/relationship target_id resolves into model.yaml'
    : ' (target_id resolvability not checked — no --model given)';
  return {
    status: 'PASS',
    message: `${records.length} census record(s) match the source element count${modelNote}; every drop carries a reason`,
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
    ['7', checkRule7(root)],
    ['8', checkRule8(root)],
    ['9', checkRule9(root)],
    ['10', checkRule10(root, allCommentsText)],
    ['C1', checkC1(root, comments)],
    ['B4', checkB4(root)],
    ['B2-lite', checkB2Lite(root)],
    ['T2-lite', checkT2Lite(root)],
  ]);

  const { model, view, census, censusFilePath, layout } = crossLayer;
  if (view) checkResults.set('UNKNOWN_ICON_SYMBOL', checkUnknownIconSymbol(root, view));
  if (model)
    checkResults.set(
      'UNTRACEABLE_VISUAL / MISSING_COMPONENT',
      checkUntraceableVisual(root, model, view),
    );
  if (model && view && layout)
    checkResults.set(
      'DIRECTION_GEOMETRY_CONFLICT',
      checkDirectionGeometryConflict(model, view, layout),
    );
  if (census)
    checkResults.set('CENSUS_MISMATCH', checkCensusMismatch(census, censusFilePath, model));

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
  node tools/rules-lint.mjs --help

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
  DIRECTION_GEOMETRY_CONFLICT       needs --model, --view, and --layout.
                                     For each model.yaml relationship,
                                     computes the net displacement between
                                     its endpoints' layout.json node centers;
                                     if view.yaml's flow.direction is one of
                                     up/down/left/right, at least
                                     ${Math.round(DIRECTION_GEOMETRY_THRESHOLD * 100)}% of relationships must have a net
                                     displacement matching that direction.
                                     "mixed" skips the check.
  CENSUS_MISMATCH                   needs --census (add --model to also
                                     check target-id resolvability).
                                     census.yaml's record count must equal
                                     its own \`source\` file's mxCell
                                     vertex+edge count (source path is
                                     resolved relative to census.yaml's own
                                     directory); every component/
                                     relationship record's target_ids must
                                     resolve into model.yaml; every
                                     primary_bucket=drop record must carry a
                                     non-empty reason.
`;

function parseArgs(argv) {
  const files = [];
  let format = 'human';
  let modelPath;
  let viewPath;
  let censusPath;
  let layoutPath;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    } else if (arg === '--format') {
      format = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
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
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) return { error: USAGE };
  if (format !== 'human' && format !== 'json')
    return { error: `Unknown --format: ${format}\n${USAGE}` };
  const anyCrossLayerFlag = Boolean(modelPath || viewPath || censusPath || layoutPath);
  if (anyCrossLayerFlag && files.length !== 1)
    return {
      error: `--model/--view/--census/--layout require exactly one <file.svg> positional argument (got ${files.length})\n${USAGE}`,
    };
  return { files, format, modelPath, viewPath, censusPath, layoutPath };
}

// Exported so tests can drive the linter in-process (same pattern as
// tools/offline-generate.mjs's runOffline) instead of shelling out.
export async function runCli(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) return { exitCode: 0, stdout: USAGE, stderr: '' };
  if (parsed.error) return { exitCode: 2, stdout: '', stderr: parsed.error };
  const { files, format, modelPath, viewPath, censusPath, layoutPath } = parsed;

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
  const crossLayer = { model, view, census, censusFilePath: censusPath, layout };

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
