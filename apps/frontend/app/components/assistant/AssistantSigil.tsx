import type { SVGAttributes } from "react";

const star = (x: number, y: number, r: number, waist = 0) => {
    const w = r * waist;
    return `M${x},${y - r}Q${x + w},${y - w} ${x + r},${y}Q${x + w},${y + w} ${x},${y + r}Q${x - w},${y + w} ${x - r},${y}Q${x - w},${y - w} ${x},${y - r}Z`;
};

const QUARTERS = [0, 90, 180, 270];

export function AssistantSigil({
    size = 16,
    notice,
    ...props
}: { size?: number; notice?: boolean } & SVGAttributes<SVGSVGElement>) {
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
                    <circle
                        className="sigil-satellite-bead"
                        r="17"
                        fill="currentColor"
                        strokeWidth="14"
                        paintOrder="stroke"
                    />
                </g>
            )}
        </svg>
    );
}
