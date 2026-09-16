import { n1, rad, rng, rotate, smoothThrough, type Pt } from "./geometry";

/*
 * Bough generator for the hero. A bough is a hand-keyed main limb plus forks
 * described by `ForkSpec`s; limbs without authored forks sprout seeded ones,
 * down to four levels. The PRNG only jitters angles, lengths and key points,
 * so each bough keeps its authored silhouette. Output is plain path strings
 * and millisecond timings, identical on server and client.
 *
 * Two kinds of path:
 * - What is seen crisp (the thick limbs' outlines, the fine twigs' strokes) is
 *   a smooth cubic Bézier curve at 0.1 precision. Points are rounded before
 *   they are differenced, so relative steps never drift.
 * - What is only ever blurred or hidden (the growth-mask and halo spines, the
 *   inner-glow steps of thick limbs) is a whole-unit polyline: smaller, and
 *   the difference cannot be seen.
 */

const round = ([x, y]: Pt): Pt => [Math.round(x), Math.round(y)];
const ip = ([x, y]: Pt): string => `${x},${y}`;

/** Relative steps between rounded points; zero steps are dropped. */
function steps(points: readonly Pt[]): string {
  let out = "";
  let prev = points[0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - prev[0];
    const dy = points[i][1] - prev[1];
    if (!dx && !dy) continue;
    out += `${out && dx >= 0 ? " " : ""}${dx},${dy}`;
    prev = points[i];
  }
  return out;
}

function polyline(points: readonly Pt[]): string {
  const r = points.map(round);
  return `M${ip(r[0])}l${steps(r)}`;
}

const r1 = ([x, y]: Pt): Pt => [n1(x), n1(y)];

/**
 * Catmull-Rom through `points` as relative cubic Béziers, from points[0] as the current point. Fine twigs are
 * a pixel or two wide, so they are emitted at whole-unit precision (`coarse`): the curve is the same to the
 * eye and the path string is a fifth shorter, which is most of the journey's HTML.
 */
function curveThrough(points: readonly Pt[], coarse = false): string {
  const q = coarse ? Math.round : n1;
  const p = points.map(coarse ? (([x, y]: Pt): Pt => [Math.round(x), Math.round(y)]) : r1);
  let out = "";
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    const c1 = `${q((p2[0] - p0[0]) / 6)},${q((p2[1] - p0[1]) / 6)}`;
    const c2 = `${q(p2[0] - p1[0] - (p3[0] - p1[0]) / 6)},${q(p2[1] - p1[1] - (p3[1] - p1[1]) / 6)}`;
    out += `c${c1} ${c2} ${q(p2[0] - p1[0])},${q(p2[1] - p1[1])}`;
  }
  return out;
}

function smoothPath(points: readonly Pt[], coarse = false): string {
  const [x, y] = coarse ? [Math.round(points[0][0]), Math.round(points[0][1])] : r1(points[0]);
  return `M${x},${y}${curveThrough(points, coarse)}`;
}

export type ForkSpec = {
  /** Where along the parent (0–1, by length) the fork leaves. */
  t: number;
  /** 1 turns clockwise off the parent's tangent, -1 counter-clockwise. */
  side: 1 | -1;
  /** A twig that doubles back toward the trunk (trees do that). */
  back?: boolean;
  /** Length as a fraction of the parent's; defaults to 0.35–0.55. */
  len?: number;
  /** Angle off the parent's tangent in degrees; defaults to 32–44 (118–134 for `back`). */
  angle?: number;
  /** A weeping strand: each stretch bends further toward straight down. */
  weep?: boolean;
  /** Omitted: seeded twigs sprout on their own. `[]`: none. */
  forks?: ForkSpec[];
  /**
   * A limb that parts from its parent and rejoins it `until` of the way along (0–1), round something the
   * parent must not cross: it follows `path` (absolute viewBox points, held exactly), keeps most of its
   * width, grows in step with the parent, and ends hidden under the parent's wood instead of in a tip.
   */
  until?: number;
  path?: readonly Pt[];
  /** Width as a share of the parent's where it leaves (default 0.55; a rejoining twin runs near 0.8). */
  wShare?: number;
};

export type BoughSpec = {
  id: string;
  seed: number;
  viewBox: readonly [number, number];
  keys: readonly Pt[];
  /** Main limb width at the trunk, in viewBox units. */
  w0: number;
  start: number;
  dur: number;
  forks: ForkSpec[];
  /** A viewBox point near the wordmark: blossom clusters closest to it open first. */
  focus: Pt;
  /**
   * Journey segments meet head to tail. "start" holds the first two keys exactly (they set the joint's
   * tangent); "both" also holds the last two, and the main limb then tapers to `wEnd` and ends in a joint,
   * not a tip.
   */
  joint?: "start" | "both";
  wEnd?: number;
  /** Blossoms open at ignition (the hero) or as the growth reaches their tip (the journey). */
  bloom?: "ignition" | "tip";
  /** Share of tips that blossom rather than bud (default 0.4; 0 for none). */
  bloomShare?: number;
  /** Flowers per cluster, [min, max] (default [2, 4]; only the journey's crown goes higher). */
  clusterSize?: readonly [number, number];
};

/**
 * A prefix of the limb's spine, for tapering with strokes: step k covers the
 * spine from the base to k/n of its length at the limb's width where that
 * stretch begins, so the stack narrows toward the tip. `len` is the prefix's
 * share of the spine, used as its `pathLength` so every step's dash grows in
 * step with the whole limb. `d` is null for the full-length step (the spine).
 */
export type Step = { d: string | null; len: number; w: number };

export type Limb = {
  /** Tapered outline (thick limbs only; fine twigs are stroked steps). */
  outline: string | null;
  spine: string;
  steps: Step[];
  w0: number;
  depth: number;
  start: number;
  dur: number;
};

export type Bud = { x: number; y: number; at: number };
export type Flower = { x: number; y: number; size: number; rot: number; at: number };

export type Bough = {
  id: string;
  viewBox: string;
  limbs: Limb[];
  buds: Bud[];
  flowers: Flower[];
};

/** Tip width by depth. */
const W_TIP = [0, 2.4, 1.8, 1.3, 1];
const KNOT = [1.09, 1.18, 1.18, 1.09];
/** Growth time by depth. */
const DUR = [0, 0, 700, 520, 400];
/**
 * Spine samples per key segment, and taper steps, by depth. Each taper step is a prefix of its limb's spine,
 * so a step costs about as much as the spine again: deep twigs take two (base and tip) rather than three, and
 * the eye cannot tell at one or two units wide.
 */
const SAMPLES = [0, 6, 5, 4, 3];
const STEPS = [0, 5, 4, 2, 2];
const MAX_DEPTH = 4;
/** Limbs up to this depth get a masked, tapered outline; deeper ones are stroked. */
const RIBBON_DEPTH = 2;
/** Blossoms open at ignition; clusters nearest the wordmark first. */
const BLOOM_AT = 1650;

type Tip = { at: Pt; dir: Pt; ready: number };

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = ([x, y]: Pt): number => Math.sqrt(x * x + y * y);
const unit = (v: Pt): Pt => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};

/** `u^1.375` from square roots only (close to the spec's 1.35 taper, exact across engines). */
const taper = (u: number): number => u * Math.sqrt(Math.sqrt(Math.sqrt(u * u * u)));

/** Tapered filled outline: upper side, a rounded tip, then the lower side reversed. */
function ribbon(spine: readonly Pt[], widths: readonly number[], scale: number): string {
  const upper: Pt[] = [];
  const lower: Pt[] = [];
  let ctrl: Pt = [0, 0];
  spine.forEach(([x, y], i) => {
    const [tx, ty] = unit(sub(spine[Math.min(spine.length - 1, i + 1)], spine[Math.max(0, i - 1)]));
    const hw = (widths[i] * scale) / 2;
    upper.push([x - ty * hw, y + tx * hw]);
    lower.push([x + ty * hw, y - tx * hw]);
    // Quadratic control one full width past the end, so the cap bulges by half a width.
    if (i === spine.length - 1) ctrl = r1([x + tx * hw * 2, y + ty * hw * 2]);
  });
  lower.reverse();
  const end = r1(upper[upper.length - 1]);
  const [lx, ly] = r1(lower[0]);
  const [ux, uy] = r1(upper[0]);
  return `M${ux},${uy}${curveThrough(upper)}q${n1(ctrl[0] - end[0])},${n1(ctrl[1] - end[1])} ${n1(lx - end[0])},${n1(ly - end[1])}${curveThrough(lower)}Z`;
}

export function generateBough(spec: BoughSpec): Bough {
  const rand = rng(spec.seed);
  const jit = (amp: number) => (rand() - 0.5) * 2 * amp;
  const joined = spec.joint === "both" && spec.wEnd !== undefined;
  const limbs: Limb[] = [];
  const tips: Tip[] = [];

  /** Seeded twigs for a limb with no authored forks: two on a branch, sometimes one on a twig. */
  function sprout(depth: number): ForkSpec[] {
    if (depth === 2) {
      const side = rand() < 0.5 ? 1 : -1;
      return [
        { t: 0.36 + rand() * 0.12, side, len: 0.42 },
        { t: 0.66 + rand() * 0.12, side: side === 1 ? -1 : 1, len: 0.36 },
      ];
    }
    if (depth === 3 && rand() < 0.55) return [{ t: 0.5 + rand() * 0.15, side: rand() < 0.5 ? 1 : -1, len: 0.45 }];
    return [];
  }

  function grow(keys: Pt[], w0: number, start: number, dur: number, depth: number, forks: ForkSpec[], rejoin = false) {
    const spine = smoothThrough(keys, SAMPLES[depth]);
    const cum = [0];
    for (let i = 1; i < spine.length; i++) cum.push(cum[i - 1] + len(sub(spine[i], spine[i - 1])));
    const total = cum[cum.length - 1];
    const tAt = cum.map((c) => c / total);
    // A joined main limb is one slice of the journey's long taper, so it narrows evenly to its joint;
    // a rejoining limb narrows only a little, since it ends in wood, not in air.
    const widths = tAt.map((t) =>
      depth === 1 && joined
        ? spec.wEnd! + (w0 - spec.wEnd!) * (1 - t)
        : rejoin
          ? w0 * (1 - 0.3 * t)
          : w0 * taper(1 - t) + W_TIP[depth],
    );
    const indexAt = (t: number) => {
      let i = 0;
      while (i < tAt.length - 1 && tAt[i] < t) i++;
      return i;
    };

    // Forks first (their knots widen the parent before its outline is built).
    const children: [Pt[], number, number, ForkSpec, number][] = [];
    for (const fork of depth < MAX_DEPTH ? forks : []) {
      const k = indexAt(fork.t);
      const knot = (at0: number) =>
        KNOT.forEach((m, j) => {
          const at = at0 - 1 + j;
          if (at >= 0 && at < widths.length) widths[at] *= m;
        });
      knot(k);
      const origin = spine[k];
      const share = (fork.wShare ?? 0.55) / KNOT[1];
      if (fork.until !== undefined) {
        const j = indexAt(fork.until);
        knot(j);
        children.push([
          [origin, ...(fork.path ?? []), spine[j]],
          widths[k] * share,
          start + dur * fork.t,
          fork,
          dur * (fork.until - fork.t),
        ]);
        continue;
      }
      const tangent = unit(sub(spine[Math.min(spine.length - 1, k + 1)], spine[Math.max(0, k - 1)]));
      const angle = fork.angle ?? (fork.back ? 118 + rand() * 16 : 32 + rand() * 12);
      const reach = total * (fork.len ?? 0.35 + rand() * 0.2);
      let dir = rotate(tangent, rad(angle) * fork.side);
      // Each twig curls back toward its parent's heading, so none stays straight.
      const curl = -fork.side * rad(3 + rand() * 4);
      const childKeys: Pt[] = [origin];
      let cur = origin;
      for (let s = 1; s <= 3; s++) {
        dir = rotate(dir, curl);
        if (fork.weep) dir = unit([dir[0] * 0.75, dir[1] * 0.75 + 0.5]);
        cur = [cur[0] + (dir[0] * reach) / 3, cur[1] + (dir[1] * reach) / 3];
        // Gravity: lateral reach sags.
        const sag = 0.12 * Math.abs(cur[0] - origin[0]) * (s / 3);
        childKeys.push([cur[0] + jit(reach * 0.04), cur[1] + sag + jit(reach * 0.04)]);
      }
      // Upward twigs droop back over their last stretch.
      if (!fork.weep && dir[1] < -0.3) {
        const last = childKeys[3];
        childKeys[3] = [last[0], last[1] + reach * 0.1];
      }
      children.push([childKeys, widths[k] * share, start + dur * fork.t, fork, DUR[depth + 1]]);
    }

    const ribbonLimb = depth <= RIBBON_DEPTH;
    const n = STEPS[depth];
    const stepList: Step[] = [];
    for (let k = 1; k <= n; k++) {
      const end = k === n ? spine.length - 1 : indexAt(k / n);
      const from = k === 1 ? 0 : indexAt((k - 1) / n);
      const prefix = spine.slice(0, end + 1);
      stepList.push({
        d: k === n ? null : ribbonLimb ? polyline(prefix) : smoothPath(prefix, depth >= 3),
        len: k === n ? 1 : Math.round(tAt[end] * 1000) / 1000,
        w: n1(widths[from]),
      });
    }

    limbs.push({
      outline: ribbonLimb ? ribbon(spine, widths, 1) : null,
      spine: ribbonLimb ? polyline(spine) : smoothPath(spine, depth >= 3),
      steps: stepList,
      w0: n1(widths[0]),
      depth,
      start: Math.round(start),
      dur: Math.round(dur),
    });
    const end = spine[spine.length - 1];
    if (!(depth === 1 && joined) && !rejoin) {
      tips.push({ at: end, dir: unit(sub(end, spine[spine.length - 3])), ready: start + dur * 0.85 });
    }

    for (const [childKeys, cw, cs, fork, cd] of children) {
      grow(childKeys, cw, cs, cd, depth + 1, fork.forks ?? sprout(depth + 1), fork.until !== undefined);
    }
  }

  // Held keys are exact; the rest are jittered. A hero bough holds only its trunk base.
  const last = spec.keys.length - 1;
  const held = (i: number) => i === 0 || (spec.joint !== undefined && i === 1) || (joined && i >= last - 1);
  grow(
    spec.keys.map(([x, y], i) => (held(i) ? [x, y] : [x + jit(8), y + jit(8)]) as Pt),
    spec.w0,
    spec.start,
    spec.dur,
    1,
    spec.forks,
  );

  // Tips: ≥18 units apart, none near the trunk base; 40 % bloom, the rest bud.
  const base = spec.keys[0];
  const kept: Tip[] = [];
  for (const tip of tips) {
    if (len(sub(tip.at, base)) < 90) continue;
    if (kept.some((k) => len(sub(k.at, tip.at)) < 18)) continue;
    kept.push(tip);
  }
  const share = spec.bloomShare ?? 0.4;
  const bloomCount = share === 0 ? 0 : Math.max(1, Math.round(kept.length * share));
  const order = kept.map((tip, i) => ({ i, r: rand() })).sort((a, b) => a.r - b.r);
  const blooming = new Set(order.slice(0, bloomCount).map((o) => o.i));

  const buds: Bud[] = [];
  const clusters: Tip[] = [];
  kept.forEach((tip, i) => {
    if (blooming.has(i)) clusters.push(tip);
    else buds.push({ x: n1(tip.at[0]), y: n1(tip.at[1]), at: Math.round(tip.ready) });
  });

  const flowers: Flower[] = [];
  clusters
    .sort((a, b) => len(sub(a.at, spec.focus)) - len(sub(b.at, spec.focus)))
    .forEach((tip, rank) => {
      const [cMin, cMax] = spec.clusterSize ?? [2, 4];
      const count = cMin + Math.floor(rand() * (cMax - cMin + 1));
      for (let f = 0; f < count; f++) {
        let at: Pt = tip.at;
        if (f > 0) {
          const off = rotate(tip.dir, rad((f % 2 ? 1 : -1) * (50 + rand() * 60)));
          // Flowers past the fourth spread further out, so a big cluster opens instead of stacking
          const spread = f > 3 ? (f - 3) * 6 : 0;
          const r = 7 + rand() * 6 + spread;
          const back = 3 + rand() * 7 + spread * 0.8;
          at = [tip.at[0] + off[0] * r - tip.dir[0] * back, tip.at[1] + off[1] * r - tip.dir[1] * back];
        }
        flowers.push({
          x: n1(at[0]),
          y: n1(at[1]),
          size: n1(f === 0 ? 14 + rand() * 2 : 9 + rand() * 5),
          rot: Math.round(rand() * 72),
          at: spec.bloom === "tip" ? Math.round(tip.ready) + f * 40 : BLOOM_AT + rank * 90 + f * 60,
        });
      }
    });

  return {
    id: spec.id,
    viewBox: `0 0 ${spec.viewBox[0]} ${spec.viewBox[1]}`,
    limbs,
    buds,
    flowers,
  };
}
