import type { SVGAttributes } from "react";

/** A four-point star centred on (x, y) with concave arms; `waist` widens them (0 = hairline). */
const star = (x: number, y: number, r: number, waist = 0) => {
    const w = r * waist;
    return `M${x},${y - r}Q${x + w},${y - w} ${x + r},${y}Q${x + w},${y + w} ${x},${y + r}Q${x - w},${y + w} ${x - r},${y}Q${x - w},${y - w} ${x},${y - r}Z`;
};

const QUARTERS = [0, 90, 180, 270];

/**
 * The assistant's mark: the landing page's sigil (a ring set with four stars, a
 * diamond at its heart) held still, with the AI star shining inside. Drawn in
 * `currentColor` so it takes whatever tone its host gives it, and weighted for
 * icon sizes (14–48px) rather than the landing's hairlines.
 *
 * With `notice` (the dock's unread reply), the small star drifts out to the ring and
 * rounds into a bead that breaks it; `false` keeps the morph ready to run either way.
 */
export function AssistantSigil({ size = 16, notice, ...props }: { size?: number; notice?: boolean } & SVGAttributes<SVGSVGElement>) {
    return (
        <svg
            {...props}
            viewBox="-100 -100 200 200"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
            focusable="false"
        >
            <circle r="82" strokeWidth="9" opacity="0.85" />
            {QUARTERS.map((a) => (
                <path key={a} d={star(0, -82, 20)} fill="currentColor" stroke="none" transform={`rotate(${a})`} />
            ))}
            <path d="M0,-56 56,0 0,56 -56,0Z" strokeWidth="7" strokeLinejoin="round" opacity="0.45" />
            <path d={star(0, 4, 44, 0.14)} fill="currentColor" stroke="none" />
            {notice === undefined ? (
                <path d={star(30, -30, 13, 0.14)} fill="currentColor" stroke="none" />
            ) : (
                <g className="sigil-satellite" data-notice={notice || undefined}>
                    <path className="sigil-satellite-star" d={star(0, 0, 13, 0.14)} fill="currentColor" stroke="none" />
                    <circle className="sigil-satellite-bead" r="17" fill="currentColor" strokeWidth="14" paintOrder="stroke" />
                </g>
            )}
        </svg>
    );
}
