import type { ComponentProps } from "react";

import { cssVars } from "~/lib/geometry";

const BASE =
  "button inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl px-5 text-sm font-medium";

/** Styles live in app.css (`.button-*`): lantern for the primary action, moonlit glass, or a quiet text link. */
const VARIANTS = {
  primary: "button-lantern",
  ghost: "button-ghost",
  quiet: "button-quiet",
} as const;

/** Four-point sparkles that twinkle on the rim: [left %, top %, size px, delay ms]. */
const STARS: readonly (readonly [number, number, number, number])[] = [
  [9, 6, 13, 0],
  [93, 24, 10, 520],
  [62, 98, 11, 1040],
];

/** Sparks that lift off the lantern's top edge on hover: [left %, drift px, delay ms]. */
const EMBERS: readonly (readonly [number, number, number])[] = [
  [18, -6, 0],
  [41, 4, 380],
  [64, -3, 760],
  [85, 7, 1140],
];

type ButtonLinkProps = ComponentProps<"a"> & {
  variant?: keyof typeof VARIANTS;
};

/** A link styled as a button. Plain `<a>` so it works before hydration and across domains. */
export function ButtonLink({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      {...props}
      className={[BASE, VARIANTS[variant], className].filter(Boolean).join(" ")}
    >
      {variant !== "quiet" && (
        <>
          <span className="button-glow" aria-hidden="true" />
          <span className="button-rim" aria-hidden="true" />
          <span className="button-aura" aria-hidden="true" />
          <span className="button-gem button-gem-l" aria-hidden="true" />
          <span className="button-gem button-gem-r" aria-hidden="true" />
          <span className="button-stars" aria-hidden="true">
            {STARS.map(([x, y, size, delay]) => (
              <span
                key={x}
                style={cssVars({ "--x": `${x}%`, "--y": `${y}%`, "--size": `${size}px`, "--d": `${delay}ms` })}
              />
            ))}
          </span>
        </>
      )}
      {variant === "primary" && (
        <span className="button-embers" aria-hidden="true">
          {EMBERS.map(([x, dx, delay]) => (
            <span key={x} style={cssVars({ "--x": `${x}%`, "--dx": `${dx}px`, "--d": `${delay}ms` })} />
          ))}
        </span>
      )}
      <span className="button-label">{children}</span>
    </a>
  );
}
