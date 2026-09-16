import type { CSSProperties, ReactNode } from "react";

/** A four-point star centred on (x, y): the crest's star, drawn as four concave arms. */
const star = (x: number, y: number, r: number) =>
  `M${x},${y - r}Q${x},${y} ${x + r},${y}Q${x},${y} ${x},${y + r}Q${x},${y} ${x - r},${y}Q${x},${y} ${x},${y - r}Z`;

const QUARTERS = [0, 90, 180, 270];
const TICKS = [30, 60, 120, 150, 210, 240, 300, 330];
/** The plum crest's five axes: a petal on each, a notch (and a star) between them. */
const FIFTHS = [0, 72, 144, 216, 288];

/**
 * The umebachi, the plum-blossom crest: five overlapping petals, outer arc to outer arc, notching where
 * they meet. Computed once (petal centres 60 out, radius 38, so the notches fall at 62.7 and the tips at 98).
 */
const UMEBACHI =
  "M-36.8,-50.7A38,38 0 1,1 36.8,-50.7A38,38 0 1,1 59.6,19.4A38,38 0 1,1 0,62.7A38,38 0 1,1 -59.6,19.4A38,38 0 1,1 -36.8,-50.7Z";

/*
 * A sigil of light: the buttons' aura grown into rings, in the crest's gold (Genshin's constellation circles).
 * Emilie's presence is set in the plain one: two circles with a diamond at its heart. The finale's seal
 * (Finale.tsx) takes the `blossom` variant instead, so the page's last mark is the page's own flower rather
 * than a second copy of hers: the outer ring is the plum crest, and inside it the stamens reach out from
 * behind the disc. The rings are drawn on their section's scroll, then turn slowly, each in its own <svg>,
 * so the turn is a composited transform.
 */
export function Sigil({
  className,
  style,
  blossom = false,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  blossom?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={["sigil", blossom && "sigil-blossom", className].filter(Boolean).join(" ")} style={style}>
      <span className="sigil-glow" aria-hidden="true" />
      {/* Each ring turns on a box around its <svg>: Chrome composites no transform on an <svg> element itself */}
      <span className="sigil-ring sigil-ring-outer" aria-hidden="true">
        <svg viewBox="-100 -100 200 200" focusable="false">
          {blossom ? (
            <>
              <circle className="sigil-faint" r="99" />
              <path className="sigil-ink sigil-petals" d={UMEBACHI} pathLength={1} />
              {/* A star set in each notch, where two petals meet */}
              {FIFTHS.map((a) => (
                <path key={a} className="sigil-star" d={star(0, -62.7, 6)} transform={`rotate(${a + 36})`} />
              ))}
            </>
          ) : (
            <>
              <circle className="sigil-faint" r="87" />
              <circle className="sigil-ink" r="95" pathLength={1} transform="rotate(-90)" />
              {QUARTERS.map((a) => (
                <path key={a} className="sigil-star" d={star(0, -95, 7.5)} transform={`rotate(${a})`} />
              ))}
              {TICKS.map((a) => (
                <circle key={a} className="sigil-dot" r="1.4" cy="-95" transform={`rotate(${a})`} />
              ))}
            </>
          )}
        </svg>
      </span>
      <span className="sigil-ring sigil-ring-inner" aria-hidden="true">
        <svg viewBox="-100 -100 200 200" focusable="false">
          {blossom ? (
            <>
              <circle className="sigil-ink" r="52" pathLength={1} transform="rotate(135)" />
              {/* Stamens: ten, out from behind the disc, each tipped with its anther */}
              {FIFTHS.flatMap((a) => [a, a + 36]).map((a, i) => (
                <g key={a} transform={a ? `rotate(${a})` : undefined}>
                  <path className="sigil-stamen" d={i % 2 ? "M0,-55V-68" : "M0,-55V-77"} />
                  <circle className="sigil-dot" r={i % 2 ? 1.6 : 2.2} cy={i % 2 ? -70.5 : -80} />
                </g>
              ))}
            </>
          ) : (
            <>
              <circle className="sigil-ink" r="72" pathLength={1} transform="rotate(135)" />
              <path className="sigil-ink sigil-ink-late" d="M0,-60 60,0 0,60 -60,0Z" pathLength={1} />
              {QUARTERS.map((a) => (
                <path key={a} className="sigil-star" d="M0,-80 4,-72 0,-64 -4,-72Z" transform={`rotate(${a + 45})`} />
              ))}
            </>
          )}
        </svg>
      </span>
      {children}
    </div>
  );
}
