#!/usr/bin/env node
// Converts every multi-bend <polyline> connector in a showcase final.svg
// into a <path> whose straight runs use H/L/V and whose 90° bends use a
// uniform-radius Q arc (rule 3a, diagram-rules.md). Single-segment
// (2-point) polylines are left untouched — there's no corner to round.
//
// Clamp clause (rule 3a, amended 2026-08-24 — the reproduce-mode
// exemption was removed, rounding now applies in both conversion modes):
// where a bend's adjacent straight segment is shorter than 2r, the arc
// clamps to r_eff = min(r, in/2, out/2) for THAT bend only -- a mechanical
// constraint driven by the two segments touching that one vertex, not a
// second declared radius. This is safe against two clamped bends sharing
// one short middle segment: each bend's r_eff is bounded by half of that
// shared segment's own length, so the two trims can sum to at most the
// full segment length and never cross (in the exact-equality case the two
// arcs sit back to back with a zero-length straight run between them,
// which the H/V emission below already handles as a no-op command).
//
// Usage: node round-connectors.mjs <final.svg> <radius> [--write]
// Without --write, prints the new SVG to stdout for review.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , filePath, radiusArg, flag] = process.argv;
if (!filePath || !radiusArg) {
  console.error('Usage: node round-connectors.mjs <final.svg> <radius> [--write]');
  process.exit(2);
}
const RADIUS = Number.parseFloat(radiusArg);
const WRITE = flag === '--write';

const text = readFileSync(filePath, 'utf8');

// Only touch <polyline> tags OUTSIDE <defs>...</defs> (icon glyphs inside
// <symbol> — e.g. the compass/network icon polylines — must stay untouched;
// they aren't connectors and this whole rounding treatment doesn't apply to
// them).
function isInsideDefs(text, index) {
  const lastDefsOpen = text.lastIndexOf('<defs>', index);
  const lastDefsClose = text.lastIndexOf('</defs>', index);
  return lastDefsOpen !== -1 && lastDefsOpen > lastDefsClose;
}

function parseAttrs(str) {
  const attrs = [];
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(str))) attrs.push([m[1], m[2]]);
  return attrs;
}

function parsePoints(str) {
  const nums = str.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push([Number.parseFloat(nums[i]), Number.parseFloat(nums[i + 1])]);
  }
  return pts;
}

function fmt(n) {
  // Trim to at most 3 decimals, strip trailing zeros — keeps the diff
  // readable and matches this codebase's existing coordinate style.
  const r = Math.round(n * 1000) / 1000;
  return String(r);
}

function isRealBend(prev, v, next) {
  const cross = (v[0] - prev[0]) * (next[1] - v[1]) - (v[1] - prev[1]) * (next[0] - v[0]);
  return Math.abs(cross) > 1e-6;
}

// Some source polylines carry a redundant collinear waypoint (e.g. a 3-way
// fan-out where the straight-through branch repeats the shared fan vertex
// as its own middle point, purely so all three branches start from a
// common written anchor). That's not a real 90° bend — drop it before bend
// processing so it doesn't get treated as one.
function collapseCollinear(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const v = pts[i];
    const next = pts[i + 1];
    if (isRealBend(prev, v, next)) out.push(v);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

let clampedBendCount = 0;

function buildRoundedPath(rawPts, r) {
  const pts = collapseCollinear(rawPts);
  const n = pts.length;
  const parts = [`M ${fmt(pts[0][0])},${fmt(pts[0][1])}`];
  let cur = pts[0];
  for (let i = 1; i < n - 1; i += 1) {
    const prev = pts[i - 1];
    const v = pts[i];
    const next = pts[i + 1];
    const dIn = [v[0] - prev[0], v[1] - prev[1]];
    const dInLen = Math.hypot(dIn[0], dIn[1]);
    const dOut = [next[0] - v[0], next[1] - v[1]];
    const dOutLen = Math.hypot(dOut[0], dOut[1]);

    // Clamp clause: this bend's own two adjacent legs bound how big its
    // arc can be, independent of the diagram's uniform radius r.
    const rEff = Math.min(r, dInLen / 2, dOutLen / 2);
    if (rEff < r - 1e-9) clampedBendCount += 1;

    const A = [v[0] - (dIn[0] / dInLen) * rEff, v[1] - (dIn[1] / dInLen) * rEff];
    const B = [v[0] + (dOut[0] / dOutLen) * rEff, v[1] + (dOut[1] / dOutLen) * rEff];

    // Straight run from `cur` to A: horizontal or vertical (orthogonal
    // routing only — rule 3 stands).
    if (Math.abs(A[1] - cur[1]) < 1e-6) parts.push(`H ${fmt(A[0])}`);
    else if (Math.abs(A[0] - cur[0]) < 1e-6) parts.push(`V ${fmt(A[1])}`);
    else throw new Error(`Non-orthogonal segment into bend ${i}: cur=${cur} A=${A}`);

    parts.push(`Q ${fmt(v[0])},${fmt(v[1])} ${fmt(B[0])},${fmt(B[1])}`);
    cur = B;
  }
  const last = pts[n - 1];
  if (Math.abs(last[1] - cur[1]) < 1e-6) parts.push(`H ${fmt(last[0])}`);
  else if (Math.abs(last[0] - cur[0]) < 1e-6) parts.push(`V ${fmt(last[1])}`);
  else throw new Error(`Non-orthogonal final segment: cur=${cur} last=${last}`);
  return parts.join(' ');
}

let convertedCount = 0;
let untouchedCount = 0;

const TAG_RE = /<polyline\b([^>]*?)\/?>/g;
const out = text.replace(TAG_RE, (full, attrStr, offset) => {
  if (isInsideDefs(text, offset)) return full; // icon glyph, not a connector
  const attrs = parseAttrs(attrStr);
  const pointsAttr = attrs.find(([k]) => k === 'points');
  if (!pointsAttr) return full;
  const pts = parsePoints(pointsAttr[1]);
  if (collapseCollinear(pts).length < 3) {
    untouchedCount += 1;
    return full; // single-segment straight line (post-collinear-collapse) — unchanged
  }
  const d = buildRoundedPath(pts, RADIUS);
  convertedCount += 1;
  const rebuilt = attrs.map(([k, v]) => (k === 'points' ? `d="${d}"` : `${k}="${v}"`)).join(' ');
  return `<path ${rebuilt}/>`;
});

console.error(
  `${filePath}: converted ${convertedCount} bent polyline(s), left ${untouchedCount} single-segment polyline(s) unchanged, ${clampedBendCount} bend(s) clamped below radius ${RADIUS} (short adjacent segment).`,
);

if (WRITE) {
  writeFileSync(filePath, out);
  console.error('written.');
} else {
  process.stdout.write(out);
}
