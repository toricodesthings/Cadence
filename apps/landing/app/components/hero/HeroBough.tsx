import { StaticSvg } from "~/components/StaticSvg";

import { HeroBoughLayers, type BoughName } from "./HeroBoughScene";

export function HeroBough({ name, className, depth }: { name: BoughName; className: string; depth?: number }) {
    return (
        <StaticSvg as="div" className={`hero-bough ${className}`} data-depth={depth} aria-hidden="true">
            {import.meta.env.SSR ? <HeroBoughLayers name={name} /> : null}
        </StaticSvg>
    );
}
