import { StaticSvg } from "~/components/StaticSvg";

import { HeroBoughLayers, type BoughName } from "./HeroBoughScene";

/** The wrapper is what JS reads (`[data-depth]`); the five layers inside are drawn once, at build time. */
export function HeroBough({ name, className, depth }: { name: BoughName; className: string; depth?: number }) {
  return (
    <StaticSvg as="div" className={`hero-bough ${className}`} data-depth={depth} aria-hidden="true">
      {import.meta.env.SSR ? <HeroBoughLayers name={name} /> : null}
    </StaticSvg>
  );
}
