import { Ume } from "~/components/hero/HeroBough";

/*
 * What the bough carries, season by season (6.4). Foliage is what the eye reads as the season; colour only
 * supports it, so every symbol is drawn in the chapter's own accent (re-resolved on its `[data-season]`) in
 * the hero's drawing language: rounded petals, one shaded face, a warm core.
 *
 * One <symbol> per kind, defined once in its segment's defs and placed with <use>, exactly like the ume, so a
 * season costs no more markup than a blossom does. Autumn defines two (maple and ginkgo) and alternates them.
 */

export type FoliageKind = "ume" | "wisteria" | "maple" | "frost";

/** The loading screen's leaves, the same shapes the app falls in autumn. */
const MAPLE =
  "M0,-10 L1.6,-5.2 L4.4,-6.8 L4,-3 L8,-5 L6.4,-0.8 L9.2,2.6 L4.6,2.4 L4.2,5.6 L1,3.6 L0.4,4 L0.6,9.6 L-0.6,9.6 L-0.4,4 L-1,3.6 L-4.2,5.6 L-4.6,2.4 L-9.2,2.6 L-6.4,-0.8 L-8,-5 L-4,-3 L-4.4,-6.8 L-1.6,-5.2 Z";
const GINKGO =
  "M-0.4,9 L-0.3,2.5 C-3,1.5 -8,-2 -9.5,-6 C-7,-9 -3,-10.5 -0.8,-9.5 L0,-7 L0.8,-9.5 C3,-10.5 7,-9 9.5,-6 C8,-2 3,1.5 0.3,2.5 L0.4,9 Z";

/** A wisteria raceme: blossoms down a stem, opening at the top, still budded at the tip. [y, r, side]. */
const RACEME: readonly (readonly [number, number, number])[] = [
  [-13, 4.2, -1], [-10.5, 4.6, 1], [-6.5, 4.4, -1], [-3, 4, 1], [0.5, 3.4, -1],
  [3.5, 3, 1], [6.5, 2.4, -1], [9, 2, 1], [11.5, 1.5, -1], [13.5, 1.1, 1],
];

const LEAF_TONE = "color-mix(in srgb, var(--accent-primary) 72%, var(--hero-lamp))";
const LEAF_SHADE = "color-mix(in srgb, var(--accent-primary) 62%, var(--hero-bark))";

export function Foliage({ id, kind }: { id: string; kind: FoliageKind }) {
  if (kind === "ume") return <Ume id={id} />;

  if (kind === "wisteria") {
    return (
      <symbol id={id} viewBox="-20 -20 40 40" overflow="visible">
        <path d="M0,-15C1.5,-8 -1.5,0 0.5,14" fill="none" stroke={LEAF_SHADE} strokeWidth=".9" strokeLinecap="round" />
        {RACEME.map(([y, r, side], i) => (
          <g key={y} transform={`translate(${(side * r) / 2.2} ${y})`}>
            <circle r={r} fill="color-mix(in srgb, var(--accent-primary) 58%, white)" opacity={i > 6 ? 0.8 : 1} />
            {/* The lower half of each blossom turns away from the moon */}
            <path
              d={`M${-r},0A${r},${r} 0 0,0 ${r},0Z`}
              fill="color-mix(in srgb, var(--accent-primary) 72%, var(--color-twilight-deep))"
              opacity=".5"
            />
          </g>
        ))}
      </symbol>
    );
  }

  if (kind === "maple") {
    return (
      <>
        <symbol id={id} viewBox="-20 -20 40 40" overflow="visible">
          <path d={MAPLE} fill={LEAF_TONE} transform="scale(1.5)" />
          <path
            d="M0,4L0,-8.6M0,2.6L6.8,-4.2M0,2.6L-6.8,-4.2"
            fill="none"
            stroke={LEAF_SHADE}
            strokeWidth=".7"
            strokeLinecap="round"
            transform="scale(1.5)"
            opacity=".7"
          />
        </symbol>
        <symbol id={`${id}-b`} viewBox="-20 -20 40 40" overflow="visible">
          <path d={GINKGO} fill="color-mix(in srgb, var(--accent-primary) 60%, var(--hero-lamp))" transform="scale(1.5)" />
          <path
            d="M0,2.2L-6.8,-6.4M0,2.2L0,-7M0,2.2L6.8,-6.4"
            fill="none"
            stroke={LEAF_SHADE}
            strokeWidth=".6"
            strokeLinecap="round"
            transform="scale(1.5)"
            opacity=".6"
          />
        </symbol>
      </>
    );
  }

  // Frost: winter's wood is bare, and what it carries is ice — a six-point crystal with a lit heart
  return (
    <symbol id={id} viewBox="-20 -20 40 40" overflow="visible">
      <g
        fill="none"
        stroke="color-mix(in srgb, var(--accent-primary) 45%, white)"
        strokeWidth="1.1"
        strokeLinecap="round"
      >
        <path d="M0,-11V11M-9.5,-5.5L9.5,5.5M-9.5,5.5L9.5,-5.5" />
        <path d="M0,-7L-2.6,-9.6M0,-7L2.6,-9.6M0,7L-2.6,9.6M0,7L2.6,9.6" strokeWidth=".8" opacity=".8" />
      </g>
      <circle r="2.4" fill="color-mix(in srgb, var(--accent-primary) 35%, white)" opacity=".35" />
      <circle r="1.1" fill="white" opacity=".8" />
    </symbol>
  );
}
