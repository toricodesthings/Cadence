import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { rng, TAU } from "~/lib/geometry";

/*
 * The cloud pass: pressing a sign-up link (`a[data-cloud]`) rolls banks of dusk cloud across the screen, left to
 * right, and the browser follows the link once the sky is covered. The link stays a plain <a>: before hydration,
 * or with a modifier key, it just navigates. Nothing renders until the first press (cloud-pass.css).
 *
 * Depth comes from masses, not a wall: every bank is a field of cumulus clusters, each lit on its crown and
 * shadowed under its belly, drawn top row first so a lower cluster's lit crown sits against the shade of the one
 * above. The back bank is dusky and whole; the nearer ones are paler, brighter and broken, so it shows through.
 * Each bank is painted once to a half-resolution canvas (cloud is soft, so nothing is lost) and then only
 * translates.
 */

/** Once the front bank has covered the screen, leave. */
const NAVIGATE_MS = 1050;
const REDUCED_MS = 260;
/** Canvas pixels per CSS pixel. */
const RES = 0.5;

type RGB = readonly [number, number, number];
type Palette = { lit: RGB; body: RGB; shade: RGB; deep: RGB };
type Tones = readonly [top: RGB, mid: RGB, low: RGB];

type Bank = {
  name: "back" | "mid" | "front";
  seed: number;
  /** Share of the body's cells that hold a cluster; the rim is always whole. */
  density: number;
  /** A shaded ground under the clusters, so the farthest bank never shows sky. */
  ground: boolean;
  tones: (p: Palette) => Tones;
};

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const BANKS: readonly Bank[] = [
  // Pale, so a translucent bank glows over the night rather than muddying it
  { name: "back", seed: 11, density: 1, ground: true, tones: (p) => [p.body, mix(p.body, p.shade, 0.5), p.shade] },
  { name: "mid", seed: 29, density: 0.72, ground: false, tones: (p) => [p.lit, p.body, mix(p.body, p.shade, 0.6)] },
  { name: "front", seed: 47, density: 0.45, ground: false, tones: (p) => [p.lit, p.lit, p.body] },
];

const WHITE: RGB = [255, 255, 255];

/** The brand's tokens as numbers: lamp-warmed crowns, moonlit body, violet-grey undersides, dusk in the deepest shade. */
function readPalette(): Palette {
  const probe = document.createElement("span");
  document.body.appendChild(probe);
  const read = (token: string): RGB => {
    probe.style.color = `var(${token})`;
    const m = getComputedStyle(probe).color.match(/[\d.]+/g);
    return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : WHITE;
  };
  const primary = read("--accent-primary");
  const secondary = read("--accent-secondary");
  const violet = read("--color-violet");
  const surface = read("--color-twilight-surface");
  const base = read("--color-twilight-base");
  probe.remove();
  const lit = mix(WHITE, primary, 0.18);
  const body = mix(WHITE, secondary, 0.3);
  const shade = mix(mix(body, surface, 0.35), violet, 0.22);
  const deep = mix(shade, base, 0.45);
  return { lit, body, shade, deep };
}

type Puff = { x: number; y: number; r: number };

/** A soft ellipse of one colour, melting to nothing at its rim. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c: RGB, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * One cumulus: a flat base and many domes, rising highest near its middle. The puffs are flat tone (a sphere's
 * highlight on each reads as cotton balls); the modelling is the mass's own: crown to belly by height, one broad
 * light across its top, one soft shadow under it.
 */
function cluster(ctx: CanvasRenderingContext2D, r: () => number, x: number, y: number, R: number, tones: Tones) {
  // Each mass sits at its own distance: the farther, the more it sinks toward shade
  const far = r() * 0.35;
  const top = mix(tones[0], tones[1], far);
  const mid = mix(tones[1], tones[2], far);
  const low = tones[2];
  // Its shadow on whatever lies behind, so every mass stands apart from the next
  glow(ctx, x + R * 0.12, y + R * 0.2, R * 1.4, R * 0.85, low, 0.22);
  const puffs: Puff[] = [];
  for (let i = 0; i < 4; i++) {
    puffs.push({ x: x + (i - 1.5) * R * 0.55 + (r() - 0.5) * R * 0.2, y: y + R * (0.3 + r() * 0.1), r: R * (0.42 + r() * 0.14) });
  }
  const domes = 8 + Math.floor(r() * 5);
  for (let i = 0; i < domes; i++) {
    const u = r() * 2 - 1;
    const rise = 1 - Math.abs(u);
    puffs.push({
      x: x + u * R * 0.95,
      y: y + R * 0.12 - R * (0.6 * rise * (0.6 + r() * 0.4) + 0.08 * r()),
      r: R * (0.24 + r() * 0.2 + 0.18 * rise),
    });
  }
  // Lowest first, so each dome sits over what's beneath it
  puffs.sort((a, b) => b.y - a.y);
  const crest = y - R * 0.85;
  const span = R * 1.5;
  for (const p of puffs) {
    const t = clamp01((p.y - crest) / span);
    const c = t < 0.5 ? mix(top, mid, t * 2) : mix(mid, low, (t - 0.5) * 2);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, rgba(c));
    g.addColorStop(0.5, rgba(c, 0.85));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
  }
  // The belly's shadow, then sunlight across the crown, slightly ahead (the light comes with the bank)
  glow(ctx, x, y + R * 0.42, R * 1.15, R * 0.34, low, 0.28);
  glow(ctx, x + R * 0.15, y - R * 0.38, R * 0.8, R * 0.42, top, 0.55);
}

function paintBank(cv: HTMLCanvasElement, bank: Bank, pal: Palette, vw: number, vh: number) {
  const r = rng(bank.seed);
  const s = Math.min(vw, vh);
  const edge = vw * 1.02;
  const w = edge + s * 0.9;
  const h = vh * 1.2;
  cv.width = Math.ceil(w * RES);
  cv.height = Math.ceil(h * RES);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const out = cv.getContext("2d");
  // Drawn into a buffer, then onto the bank once through a blur: soft as mist, and never blurred again
  const buf = document.createElement("canvas");
  buf.width = cv.width;
  buf.height = cv.height;
  const ctx = buf.getContext("2d");
  if (!out || !ctx) return;
  ctx.scale(RES, RES);
  const tones = bank.tones(pal);

  if (bank.ground) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba(tones[1]));
    g.addColorStop(0.6, rgba(tones[2]));
    g.addColorStop(1, rgba(tones[2]));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, edge - s * 0.12, h);
  }

  // Rows of clusters, top row first; each row ends in a rim cluster at the leading edge
  const row = s * 0.3;
  const col = s * 0.46;
  for (let y = -s * 0.05; y < h + s * 0.2; y += row * (0.8 + r() * 0.4)) {
    for (let x = -s * 0.1; x < edge - s * 0.15; x += col * (0.7 + r() * 0.6)) {
      const R = s * (0.15 + r() * 0.12);
      const jx = (r() - 0.5) * col * 0.4;
      const jy = (r() - 0.5) * row * 0.4;
      if (r() < bank.density) cluster(ctx, r, x + jx, y + jy, R, tones);
    }
    cluster(ctx, r, edge + (r() - 0.3) * s * 0.15, y, s * (0.17 + r() * 0.1), tones);
  }

  // Wisps of haze ahead of the edge
  for (let i = 0; i < 5; i++) {
    const x = edge + s * (0.25 + r() * 0.3);
    const y = r() * h;
    const rx = s * (0.18 + r() * 0.16);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.14);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(tones[0], 0.32));
    g.addColorStop(1, rgba(tones[0], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Browsers without canvas filters draw it unblurred; the puffs' own falloff still keeps it soft
  out.filter = `blur(${Math.max(2, Math.round(s * 0.014 * RES))}px)`;
  out.drawImage(buf, 0, 0);
}

type Sky = { vw: number; vh: number; pal: Palette };

function CloudBank({ bank, sky }: { bank: Bank; sky: Sky }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Painted before the first frame, so the bank never rolls in empty
  useLayoutEffect(() => {
    if (ref.current) paintBank(ref.current, bank, sky.pal, sky.vw, sky.vh);
  }, [bank, sky]);
  return <canvas ref={ref} className={`cloud-bank cloud-bank-${bank.name}`} />;
}

const cloudLink = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLAnchorElement>("a[data-cloud]") : null;

export function CloudPass() {
  const [sky, setSky] = useState<Sky | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    let timer = 0;
    // Paint the banks while the pointer rests on (or focus lands on) a cloud link, so the press only starts the roll
    const warm = () =>
      setSky((prev) =>
        prev && prev.vw === window.innerWidth && prev.vh === window.innerHeight
          ? prev
          : { vw: window.innerWidth, vh: window.innerHeight, pal: readPalette() },
      );
    const onNear = (e: Event) => {
      if (cloudLink(e.target)) warm();
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = cloudLink(e.target);
      if (!link) return;
      e.preventDefault();
      if (timer) return;
      warm();
      setOn(true);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      timer = window.setTimeout(() => window.location.assign(link.href), reduced ? REDUCED_MS : NAVIGATE_MS);
    };
    // Back from the app via the back/forward cache: clear the sky
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      window.clearTimeout(timer);
      timer = 0;
      setOn(false);
    };
    document.addEventListener("pointerover", onNear, { passive: true });
    document.addEventListener("focusin", onNear);
    document.addEventListener("click", onClick);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("pointerover", onNear);
      document.removeEventListener("focusin", onNear);
      document.removeEventListener("click", onClick);
      window.removeEventListener("pageshow", onShow);
      window.clearTimeout(timer);
    };
  }, []);

  if (!sky) return null;
  const { body, shade, deep } = sky.pal;
  return (
    <div className={on ? "cloud-pass is-on" : "cloud-pass"} aria-hidden="true">
      <div
        className="cloud-veil"
        style={{ background: `linear-gradient(180deg, ${rgba(body)}, ${rgba(shade)} 55%, ${rgba(deep)})` }}
      />
      {BANKS.map((b) => (
        <CloudBank key={b.name} bank={b} sky={sky} />
      ))}
    </div>
  );
}
