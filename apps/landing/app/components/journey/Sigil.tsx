import { useId, type CSSProperties, type ReactNode } from "react";

import { StaticSvg } from "~/components/StaticSvg";
import { cssVars } from "~/lib/geometry";

const star = (x: number, y: number, r: number) =>
    `M${x},${y - r}Q${x},${y} ${x + r},${y}Q${x},${y} ${x},${y + r}Q${x},${y} ${x - r},${y}Q${x},${y} ${x},${y - r}Z`;

const QUARTERS = [0, 90, 180, 270];
const TICKS = [30, 60, 120, 150, 210, 240, 300, 330];
const PETALS = [0, 72, 144, 216, 288];

const UMEBACHI =
    "M-36.8,-50.7A38,38 0 1,1 36.8,-50.7A38,38 0 1,1 59.6,19.4A38,38 0 1,1 0,62.7A38,38 0 1,1 -59.6,19.4A38,38 0 1,1 -36.8,-50.7Z";

const UMEBACHI_MASK = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-100 -100 200 200'><path d='${UMEBACHI}' fill='none' stroke='#000' stroke-width='1.6' stroke-linejoin='round'/></svg>`,
)}")`;

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
    const ink = `sigil-ink-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    return (
        <div
            className={["sigil", blossom && "sigil-blossom", className].filter(Boolean).join(" ")}
            style={{ ...style, ...cssVars({ "--sigil-ink": `url(#${ink})` }) }}
        >
            <span className="sigil-glow" aria-hidden="true" />
            <span className="sigil-ring sigil-ring-outer" aria-hidden="true">
                <StaticSvg viewBox="-100 -100 200 200" focusable="false">
                    {import.meta.env.SSR ? <OuterBody ink={ink} blossom={blossom} /> : null}
                </StaticSvg>
            </span>
            {blossom && (
                <span
                    className="blossom-aura"
                    style={cssVars({ "--blossom-mask": UMEBACHI_MASK })}
                    aria-hidden="true"
                />
            )}
            {!blossom && (
                <span className="sigil-ring sigil-ring-inner" aria-hidden="true">
                    <StaticSvg viewBox="-100 -100 200 200" focusable="false">
                        {import.meta.env.SSR ? <InnerBody /> : null}
                    </StaticSvg>
                </span>
            )}
            {children}
        </div>
    );
}

function OuterBody({ ink, blossom }: { ink: string; blossom: boolean }) {
    return (
        <>
            <defs>
                <linearGradient id={ink} gradientUnits="userSpaceOnUse" x1="-100" y1="-100" x2="100" y2="100">
                    <stop offset=".08" stopColor="var(--hero-sigil-berry)" />
                    <stop offset=".3" stopColor="var(--hero-sigil-coral)" />
                    <stop offset=".48" stopColor="var(--hero-sigil-orange)" />
                    <stop offset=".68" stopColor="var(--hero-sigil-amber)" />
                    <stop offset=".9" stopColor="var(--hero-sigil-orange)" />
                </linearGradient>
            </defs>
            {blossom ? (
                <>
                    <path className="sigil-faint" d={UMEBACHI} transform="scale(1.08)" />
                    <path className="sigil-ink sigil-petals" d={UMEBACHI} pathLength={1} />
                    {PETALS.map((a) => (
                        <path key={a} className="sigil-star" d={star(0, -98, 5)} transform={`rotate(${a})`} />
                    ))}
                    {PETALS.map((a) => (
                        <circle key={a} className="sigil-dot" r="1.4" cy="-62.7" transform={`rotate(${a + 36})`} />
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
        </>
    );
}

function InnerBody() {
    return (
        <>
            <circle className="sigil-ink" r="72" pathLength={1} transform="rotate(135)" />
            <path className="sigil-ink sigil-ink-late" d="M0,-60 60,0 0,60 -60,0Z" pathLength={1} />
            {QUARTERS.map((a) => (
                <path key={a} className="sigil-star" d="M0,-80 4,-72 0,-64 -4,-72Z" transform={`rotate(${a + 45})`} />
            ))}
        </>
    );
}
