import { cssVars, n1, rng } from "~/lib/geometry";

/*
 * A section's particle set: a few slow motes in their own layer. Only transform and opacity move, the set is
 * paused with its section offscreen, and it is gone under reduced motion (journey.css). Seeded, so the server
 * and the client place every mote the same.
 */

export type DriftKind =
  | "lantern" // the valley's sky lanterns, rising past the Prelude
  | "petal" // spring: ume petals drifting down
  | "firefly" // summer
  | "leaf" // autumn: leaves turning as they fall
  | "snow" // winter
  | "mote" // Emilie: sparks rising off her light
  | "fall"; // the finale: petals falling from the crown

const SET: Record<DriftKind, { count: number; dur: readonly [number, number]; seed: number; flank?: boolean }> = {
  lantern: { count: 6, dur: [30, 42], seed: 29, flank: true },
  petal: { count: 8, dur: [15, 23], seed: 31 },
  firefly: { count: 7, dur: [7, 12], seed: 37 },
  leaf: { count: 7, dur: [13, 19], seed: 41 },
  snow: { count: 8, dur: [17, 25], seed: 43 },
  mote: { count: 6, dur: [9, 14], seed: 47 },
  fall: { count: 14, dur: [13, 21], seed: 53 },
};

export function Drift({ kind, className }: { kind: DriftKind; className?: string }) {
  const { count, dur: [d0, d1], seed, flank } = SET[kind];
  const rand = rng(seed);
  const motes = Array.from({ length: count }, (_, i) => {
    const u = (i + 0.15 + rand() * 0.7) / count;
    // Lanterns keep to the flanks, clear of the words in the middle
    const x = flank ? (u < 0.5 ? 3 + u * 44 : 75 + (u - 0.5) * 44) : 3 + u * 94;
    const dur = d0 + rand() * (d1 - d0);
    return cssVars({
      "--x": `${n1(x)}%`,
      "--y": n1(rand()),
      "--s": n1(0.7 + rand() * 0.6),
      "--dx": `${Math.round((rand() - 0.5) * 180)}px`,
      "--dur": `${n1(dur)}s`,
      "--delay": `${n1(-rand() * dur)}s`,
    });
  });
  return (
    <div className={["drift", `drift-${kind}`, className].filter(Boolean).join(" ")} aria-hidden="true">
      {motes.map((style, i) => (
        <span key={i} style={style} />
      ))}
    </div>
  );
}
