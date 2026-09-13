import { GINKGO_HALF, GINKGO_LEAF, GINKGO_VEINS, MAPLE_HALF, MAPLE_LEAF, MAPLE_VEINS, PIER_D, TERRACE_D, WATER_D } from "./loading-geometry";

/** Rounded paper sky lantern, lit from within: soft stops, no dark rim, so it reads painted rather than photographic. */
const LANTERN_BODY = "M -17,-26 Q 0,-33 17,-26 Q 19,-4 13,15 Q 0,19 -13,15 Q -19,-4 -17,-26 Z";
const LANTERN_BODIES: Record<string, readonly [string, string, string, string]> = {
    amber: ["#FFF2C4", "var(--loading-flame-mid)", "#F7A03A", "#E4782C"],
    honey: ["#FFF6D6", "#FFE08A", "#F5B550", "#E08A34"],
    vermilion: ["#FFE9C0", "#FFB866", "#F57A3A", "#DC4A24"],
};

const BULBS: readonly (readonly [number, number, number])[] = [[50, 20, 3], [100, 35, 3], [150, 40, 4], [200, 35, 3], [250, 20, 3]];
const MULLIONS = "M7,2h2v20h-2zM2,10h12v2h-12z";
const ROOF_RIM = { stroke: "var(--loading-rim)", strokeWidth: 1, opacity: 0.35, fill: "none", strokeLinecap: "round" as const };
const CROWN =
    "M-62,6 C-72,-4 -66,-20 -54,-22 C-62,-34 -50,-48 -36,-44 C-36,-58 -18,-66 -6,-56 C2,-72 24,-68 28,-54 C40,-62 56,-52 50,-38 C64,-36 72,-20 62,-10 C70,-2 64,10 54,8 C40,16 -44,16 -62,6 Z";
const HOSHIGAKI = Array.from({ length: 7 }, (_, i) => {
    const y = 7 + i * 5.6;
    const x = i % 2 ? 0.5 : -0.5;
    return `M${x - 2.6},${y}a2.6,3 0 1,0 5.2,0a2.6,3 0 1,0 -5.2,0`;
}).join("");

const blur = (id: string, sd: number) => (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={sd} />
    </filter>
);

const radial = (id: string, color: string, stops: readonly (readonly [number, number])[]) => (
    <radialGradient id={id}>
        {stops.map(([offset, opacity]) => (
            <stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
        ))}
    </radialGradient>
);

/** Shared scene defs. Lives in the backdrop SVG inside `.loading-screen` so token `var()`s in stops resolve; never hide it. */
export function LoadingDefs() {
    return (
        <defs>
            {/* Sky */}
            <radialGradient id="sky-grad" cx="50%" cy="100%" r="100%">
                <stop offset="0%" stopColor="var(--loading-sky-horizon)" />
                <stop offset="30%" stopColor="var(--loading-sky-mid)" />
                <stop offset="60%" stopColor="var(--loading-sky-deep)" />
                <stop offset="100%" stopColor="var(--loading-sky-deep)" />
            </radialGradient>
            <linearGradient id="ls-sky-overlay" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1080">
                <stop offset="0" stopColor="var(--loading-sky-zenith)" />
                <stop offset=".4" stopColor="var(--loading-sky-plum)" stopOpacity=".92" />
                <stop offset=".7" stopColor="var(--loading-sky-glow)" stopOpacity=".32" />
                <stop offset="1" stopColor="var(--loading-sky-glow)" stopOpacity=".6" />
            </linearGradient>
            {/* Town light lifting into the haze: hugs the ridge line instead of filling the mid-sky like a sunset */}
            <radialGradient id="ls-sky-glow" gradientUnits="userSpaceOnUse" cx="960" cy="830" r="600">
                <stop offset="0" stopColor="var(--loading-sky-glow)" stopOpacity=".8" />
                <stop offset=".4" stopColor="var(--loading-sky-glow)" stopOpacity=".32" />
                <stop offset="1" stopColor="var(--loading-sky-glow)" stopOpacity="0" />
            </radialGradient>
            {/* One key light for the whole landscape: cool moonlight falling off from the moon, laid over every ridge */}
            <radialGradient id="ls-moonlight" gradientUnits="userSpaceOnUse" cx="560" cy="300" r="1150">
                <stop offset="0" stopColor="var(--loading-rim)" stopOpacity=".17" />
                <stop offset=".4" stopColor="var(--loading-rim)" stopOpacity=".07" />
                <stop offset="1" stopColor="var(--loading-rim)" stopOpacity="0" />
            </radialGradient>
            {/* Lantern bounce off the near hill's lower flanks, behind the houses */}
            <linearGradient id="ls-town-bounce" gradientUnits="userSpaceOnUse" x1="0" y1="1080" x2="0" y2="780">
                <stop offset="0" stopColor="var(--loading-flame-edge)" stopOpacity=".32" />
                <stop offset=".3" stopColor="var(--loading-flame-edge)" stopOpacity=".14" />
                <stop offset="1" stopColor="var(--loading-flame-edge)" stopOpacity="0" />
            </linearGradient>
            {/* Moon is upper-left: the town's right-hand clusters sit a step into shadow with a night-blue cast; the hero cluster deeper still */}
            <filter id="ls-shade-r" colorInterpolationFilters="sRGB">
                <feComponentTransfer>
                    <feFuncR type="linear" slope=".84" />
                    <feFuncG type="linear" slope=".82" />
                    <feFuncB type="linear" slope=".88" intercept=".035" />
                </feComponentTransfer>
            </filter>
            <filter id="ls-shade-r2" colorInterpolationFilters="sRGB">
                <feComponentTransfer>
                    <feFuncR type="linear" slope=".76" />
                    <feFuncG type="linear" slope=".74" />
                    <feFuncB type="linear" slope=".84" intercept=".04" />
                </feComponentTransfer>
            </filter>
            <linearGradient id="ls-star-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="620">
                <stop offset=".5" stopColor="#fff" />
                <stop offset="1" stopColor="#000" />
            </linearGradient>
            <mask id="ls-star-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="640">
                <rect width="1920" height="640" fill="url(#ls-star-fade)" />
            </mask>

            {/* Key light (moon / sun) */}
            {radial("ls-key-halo-wide", "var(--loading-key)", [[0, 0.05], [0.5, 0.02], [1, 0]])}
            {radial("ls-key-halo", "var(--loading-key)", [[0, 0.16], [0.35, 0.08], [1, 0]])}
            <radialGradient id="ls-key-disk">
                <stop offset="0" stopColor="var(--loading-key)" />
                <stop offset=".86" stopColor="var(--loading-key-edge)" />
                <stop offset=".94" stopColor="var(--loading-key-edge)" stopOpacity=".55" />
                <stop offset="1" stopColor="var(--loading-key-edge)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ls-column-grad" gradientUnits="userSpaceOnUse" x1="0" y1="985" x2="0" y2="1080">
                <stop offset="0" stopColor="var(--loading-key-edge)" stopOpacity=".35" />
                <stop offset="1" stopColor="var(--loading-key-edge)" stopOpacity=".12" />
            </linearGradient>

            {/* Landscape — each ridge's base lightens into the mist below it */}
            <linearGradient id="ls-distant" gradientUnits="userSpaceOnUse" x1="0" y1="540" x2="0" y2="720">
                <stop offset="0" stopColor="var(--loading-haze-far)" />
                <stop offset="1" stopColor="var(--ls-distant-base)" />
            </linearGradient>
            <linearGradient id="mountain-back-1" gradientUnits="userSpaceOnUse" x1="0" y1="520" x2="0" y2="800">
                <stop offset="0" stopColor="var(--loading-mountain-far)" />
                <stop offset="1" stopColor="var(--ls-far-base)" />
            </linearGradient>
            <linearGradient id="mountain-back-2" gradientUnits="userSpaceOnUse" x1="0" y1="640" x2="0" y2="900">
                <stop offset="0" stopColor="var(--loading-mountain-mid)" />
                <stop offset="1" stopColor="var(--ls-midfar-base)" />
            </linearGradient>
            <linearGradient id="mountain-mid" gradientUnits="userSpaceOnUse" x1="0" y1="760" x2="0" y2="1060">
                <stop offset="0" stopColor="var(--loading-mountain-near)" />
                <stop offset="1" stopColor="var(--ls-near-base)" />
            </linearGradient>
            <linearGradient id="ls-crown-grad" x1="0" y1="1" x2="0" y2="0">
                <stop offset=".3" stopColor="var(--ls-crown-lit)" />
                <stop offset=".95" stopColor="var(--loading-foliage-shade)" />
            </linearGradient>
            {(["far", "valley"] as const).flatMap((band) => {
                const color = band === "far" ? "var(--loading-mist)" : "var(--loading-mist-warm)";
                return [
                    <linearGradient key={`${band}v`} id={`ls-mist-v-${band}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={color} stopOpacity="0" />
                        <stop offset=".5" stopColor={color} />
                        <stop offset="1" stopColor={color} stopOpacity="0" />
                    </linearGradient>,
                    <radialGradient key={`${band}p`} id={`ls-mist-puff-${band}`}>
                        <stop offset="0" stopColor={color} />
                        <stop offset="1" stopColor={color} stopOpacity="0" />
                    </radialGradient>,
                ];
            })}

            {/* Water */}
            <linearGradient id="water-grad" gradientUnits="userSpaceOnUse" x1="0" y1="965" x2="0" y2="1080">
                <stop offset="0" stopColor="var(--loading-water-top)" stopOpacity=".95" />
                <stop offset=".4" stopColor="var(--loading-water-mid)" stopOpacity=".98" />
                <stop offset="1" stopColor="var(--loading-water-deep)" />
            </linearGradient>
            <linearGradient id="ls-reflect-fade" gradientUnits="userSpaceOnUse" x1="0" y1="985" x2="0" y2="1055">
                <stop offset="0" stopColor="#fff" />
                <stop offset="1" stopColor="#000" />
            </linearGradient>
            <pattern id="ls-ripple-gaps" width="260" height="6" patternUnits="userSpaceOnUse">
                <path d="M0,4.5H150M170,1.5H240" stroke="#000" strokeWidth="1.4" />
            </pattern>
            <path id="ls-water-shape" d={WATER_D} />
            <path id="ls-pier-shape" d={PIER_D} />
            <path id="ls-terrace-shape" d={TERRACE_D} />
            <g id="ls-obstacles">
                <use href="#ls-pier-shape" />
                <use href="#ls-terrace-shape" />
                <rect x="-40" y="975" width="350" height="48" />
            </g>
            <mask id="ls-water-mask" maskUnits="userSpaceOnUse" x="-20" y="950" width="1960" height="140">
                <use href="#ls-water-shape" fill="#fff" />
                <use href="#ls-obstacles" fill="#000" />
            </mask>
            <mask id="ls-reflect-mask" maskUnits="userSpaceOnUse" x="-20" y="950" width="1960" height="140">
                <use href="#ls-water-shape" fill="url(#ls-reflect-fade)" />
                <rect x="-20" y="950" width="1960" height="140" fill="url(#ls-ripple-gaps)" />
            </mask>

            {/* Architecture */}
            <linearGradient id="wood-front" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--loading-building-front-base)" />
                <stop offset="100%" stopColor="var(--loading-building-front-top)" />
            </linearGradient>
            <linearGradient id="wood-side" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--loading-building-back-base)" />
                <stop offset="100%" stopColor="var(--loading-building-back-top)" />
            </linearGradient>
            <linearGradient id="roof-front" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--loading-roof-front-start)" />
                <stop offset="100%" stopColor="var(--loading-roof-front-end)" />
            </linearGradient>
            <linearGradient id="roof-side" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--loading-roof-side-start)" />
                <stop offset="100%" stopColor="var(--loading-roof-side-end)" />
            </linearGradient>
            <radialGradient id="window-warm" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--loading-window-center)" />
                <stop offset="70%" stopColor="var(--loading-window-edge)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--loading-window-edge)" stopOpacity="0.2" />
            </radialGradient>
            <radialGradient id="ls-window-glow">
                <stop offset="0" stopColor="var(--loading-window-edge)" style={{ stopOpacity: "var(--ls-window-glow-o)" }} />
                <stop offset="1" stopColor="var(--loading-window-edge)" stopOpacity="0" />
            </radialGradient>
            <pattern id="ls-ishigaki" width="34" height="14" patternUnits="userSpaceOnUse">
                <rect width="34" height="14" fill="var(--ls-stone)" />
                <path d="M0,.5H34M0,7.5H34M9,.5V7.5M26,.5V7.5M4,7.5V14M18,7.5V14M31,7.5V14" stroke="var(--loading-mountain-near)" strokeWidth="1.1" />
                <path d="M1,1.6H8M10,1.6H25M27,1.6H33M0,8.6H3M5,8.6H17M19,8.6H30" stroke="var(--loading-rim)" strokeWidth=".6" opacity=".18" />
            </pattern>

            {/* Fire — fixed flame tokens, the accent only tints ≤20% of the lantern outer glow */}
            {radial("ls-bulb-glow", "var(--loading-flame-mid)", [[0, 0.55], [0.4, 0.2], [1, 0]])}
            {radial("ls-spill", "var(--loading-flame-edge)", [[0, 0.24], [0.5, 0.08], [1, 0]])}
            {radial("ls-chochin-glow", "#ff6a2a", [[0, 0.38], [0.5, 0.1], [1, 0]])}
            <radialGradient id="ls-chochin-body" cx="50%" cy="45%" r="60%">
                <stop offset="0" stopColor="var(--loading-flame-mid)" />
                <stop offset=".45" stopColor="#e8431c" />
                <stop offset="1" stopColor="#7a1208" />
            </radialGradient>
            <radialGradient id="lantern-glow-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--loading-flame-core)" />
                <stop offset="20%" stopColor="var(--loading-flame-mid)" stopOpacity="0.9" />
                <stop offset="50%" stopColor="var(--loading-flame-edge)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="var(--loading-flame-edge)" stopOpacity="0" />
            </radialGradient>
            {radial("lantern-glow-outer", "var(--ls-lan-glow)", [[0, 0.6], [0.5, 0.2], [1, 0]])}
            {Object.entries(LANTERN_BODIES).map(([name, [a, b, c, d]]) => (
                <radialGradient key={name} id={`lan-body-${name}`} cx="50%" cy="60%" r="60%" fx="50%" fy="70%">
                    <stop offset="0%" stopColor={a} />
                    <stop offset="25%" stopColor={b} />
                    <stop offset="70%" stopColor={c} />
                    <stop offset="100%" stopColor={d} />
                </radialGradient>
            ))}
            {/* Logo halo rings — accent at the head of each arc, fading to moon-white and out */}
            <linearGradient id="ls-halo-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--accent-primary, #FFD166)" stopOpacity=".95" />
                <stop offset=".55" stopColor="var(--loading-key)" stopOpacity=".4" />
                <stop offset="1" stopColor="var(--accent-primary, #FFD166)" stopOpacity="0" />
            </linearGradient>

            {/* Clouds — moonlit tops, underside warmed by the town glow */}
            <linearGradient id="ls-cloud-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--ls-cloud-top)" />
                <stop offset=".35" stopColor="var(--ls-cloud-top)" />
                <stop offset="1" stopColor="var(--ls-cloud-base)" />
            </linearGradient>

            {blur("ls-blur-far", 5)}
            {blur("ls-blur-distant", 2.6)}
            {blur("ls-blur-ridge", 1.2)}
            {blur("ls-blur-midfar", 0.7)}
            {blur("ls-blur-mid", 2.2)}
            {blur("ls-blur-frame", 1.5)}
            {blur("ls-blur-grass", 1)}
            {blur("ls-blur-plume", 1.6)}
            {blur("ls-blur-bough", 0.8)}
            {blur("ls-blur-cloud", 1.1)}
            {blur("ls-blur-leaf", 0.9)}

            {/* Sky lanterns: shared parts (faint paper ribs, inner light, flat rim, open base with its flame), three body colours, outer glow for far sprites */}
            <g id="lan-parts">
                <path d="M -7,-28 Q -9,-6 -10,16 M 7,-28 Q 9,-6 10,16 M 0,-29.5 V 17.5" fill="none" stroke="#FFE7A8" strokeWidth=".8" opacity=".28" />
                <ellipse cx="0" cy="2" rx="11" ry="14" fill="url(#lantern-glow-core)" />
                <path d="M -13,-26 Q 0,-31 13,-26" fill="none" stroke="#8a3a14" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
                <ellipse cx="0" cy="15.5" rx="14" ry="3" fill="#8a3212" opacity=".55" />
                <ellipse cx="0" cy="16" rx="4.5" ry="2" fill="var(--loading-flame-core)" />
            </g>
            {Object.keys(LANTERN_BODIES).map((name) => (
                <g key={name} id={`lan-${name}`}>
                    <path d={LANTERN_BODY} fill={`url(#lan-body-${name})`} />
                    <use href="#lan-parts" />
                </g>
            ))}
            <circle id="lan-glow" cx="0" cy="5" r="40" fill="url(#lantern-glow-outer)" />

            {/* Windows — glow is baked as a radial halo, no drop-shadow filters */}
            <g id="window-3d">
                <ellipse cx="8" cy="12" rx="17" ry="19" fill="url(#ls-window-glow)" />
                <rect width="16" height="24" fill="#140804" />
                <rect x="2" y="2" width="12" height="20" fill="url(#window-warm)" />
                <path d={MULLIONS} fill="#3D1B11" />
            </g>
            <g id="window-dark">
                <rect width="16" height="24" fill="#140804" />
                <rect x="2" y="2" width="12" height="20" fill="var(--ls-window-dark)" />
                <path d={MULLIONS} fill="#241008" />
            </g>
            <g id="window-side">
                <polygon points="0,0 12,-6 12,18 0,24" fill="#0A0301" />
                <polygon points="2,2 10,-2 10,16 2,20" fill="url(#window-warm)" opacity="0.7" />
            </g>
            <g id="window-side-dark">
                <polygon points="0,0 12,-6 12,18 0,24" fill="#0A0301" />
                <polygon points="2,2 10,-2 10,16 2,20" fill="var(--ls-window-dark)" opacity="0.8" />
            </g>

            {/* Roof ridges facing the moon, for the key-light highlight on the left-hand (moon-side) buildings */}
            <path id="ba-ridge" d="M-15,-5 L5,-40 Q40,-30 75,-40 L130,-65" />
            <path id="bb-ridge" d="M-5,-20 L25,-75 Q75,-60 125,-75 L195,-110 M-25,100 L10,40 M140,40 L225,0" />
            <path id="bc-ridge" d="M-20,0 L20,-60 Q100,-45 180,-60 L250,-90" />

            {/* Buildings: shells (walls, roofs, cool moon rim on top/left roof edges) + lit / partly-unlit window sets */}
            <g id="ba-shell">
                <polygon points="0,0 80,0 80,90 0,90" fill="url(#wood-front)" />
                <polygon points="80,0 130,-25 130,65 80,90" fill="url(#wood-side)" />
                <polygon points="-10,-10 90,-10 140,-35 40,-35" fill="var(--loading-building-front-top)" />
                <path d="M -15,-5 Q 40,15 95,-5 L 75,-40 Q 40,-30 5,-40 Z" fill="url(#roof-front)" />
                <path d="M 95,-5 L 150,-30 L 130,-65 L 75,-40 Z" fill="url(#roof-side)" />
                <path d="M-15,-5 L5,-40 Q40,-30 75,-40 L130,-65" {...ROOF_RIM} />
            </g>
            <g id="bb-shell">
                <polygon points="0,100 150,100 150,220 0,220" fill="url(#wood-front)" />
                <polygon points="150,100 230,60 230,180 150,220" fill="url(#wood-side)" />
                <path d="M -25,100 Q 75,130 175,100 L 140,40 Q 75,50 10,40 Z" fill="url(#roof-front)" />
                <path d="M 175,100 L 260,60 L 225,0 L 140,40 Z" fill="url(#roof-side)" />
                <path d="M-25,100 L10,40 Q75,50 140,40 L225,0" {...ROOF_RIM} />
                <polygon points="20,-20 130,-20 130,80 20,80" fill="url(#wood-front)" />
                <polygon points="130,-20 190,-50 190,50 130,80" fill="url(#wood-side)" />
                <polygon points="10,80 140,80 140,90 10,90" fill="url(#wood-front)" />
                <polygon points="140,80 200,50 200,60 140,90" fill="url(#wood-side)" />
                <path d="M -5,-20 Q 75,0 155,-20 L 125,-75 Q 75,-60 25,-75 Z" fill="url(#roof-front)" />
                <path d="M 155,-20 L 225,-55 L 195,-110 L 125,-75 Z" fill="url(#roof-side)" />
                <path d="M-5,-20 L25,-75 Q75,-60 125,-75 L195,-110" {...ROOF_RIM} />
            </g>
            <g id="bc-shell">
                <polygon points="0,0 200,0 200,60 0,60" fill="url(#wood-front)" />
                <polygon points="200,0 260,-30 260,30 200,60" fill="url(#wood-side)" />
                <path d="M -20,0 Q 100,20 220,0 L 180,-60 Q 100,-45 20,-60 Z" fill="url(#roof-front)" />
                <path d="M 220,0 L 290,-35 L 250,-90 L 180,-60 Z" fill="url(#roof-side)" />
                <path d="M-20,0 L20,-60 Q100,-45 180,-60 L250,-90" {...ROOF_RIM} />
            </g>
            <g id="building-a">
                <use href="#ba-shell" />
                <use href="#window-3d" x="15" y="40" />
                <use href="#window-3d" x="45" y="40" />
                <use href="#window-side" x="90" y="10" />
                <use href="#window-side" x="110" y="0" />
            </g>
            <g id="building-a-alt">
                <use href="#ba-shell" />
                <use href="#window-dark" x="15" y="40" />
                <use href="#window-3d" x="45" y="40" />
                <use href="#window-side-dark" x="90" y="10" />
                <use href="#window-side" x="110" y="0" />
            </g>
            <g id="building-b">
                <use href="#bb-shell" />
                <use href="#window-3d" x="20" y="150" />
                <use href="#window-3d" x="65" y="150" />
                <use href="#window-3d" x="110" y="150" />
                <use href="#window-side" x="170" y="110" />
                <use href="#window-side" x="200" y="95" />
                <use href="#window-3d" x="40" y="30" />
                <use href="#window-3d" x="80" y="30" />
                <use href="#window-side" x="150" y="-5" />
            </g>
            <g id="building-b-alt">
                <use href="#bb-shell" />
                <use href="#window-3d" x="20" y="150" />
                <use href="#window-dark" x="65" y="150" />
                <use href="#window-3d" x="110" y="150" />
                <use href="#window-side-dark" x="170" y="110" />
                <use href="#window-side" x="200" y="95" />
                <use href="#window-dark" x="40" y="30" />
                <use href="#window-dark" x="80" y="30" />
                <use href="#window-side" x="150" y="-5" />
            </g>
            <g id="building-c">
                <use href="#bc-shell" />
                <use href="#window-3d" x="20" y="20" />
                <use href="#window-3d" x="60" y="20" />
                <use href="#window-3d" x="100" y="20" />
                <use href="#window-3d" x="140" y="20" />
            </g>
            <g id="building-c-alt">
                <use href="#bc-shell" />
                <use href="#window-dark" x="20" y="20" />
                <use href="#window-3d" x="60" y="20" />
                <use href="#window-dark" x="100" y="20" />
                <use href="#window-3d" x="140" y="20" />
            </g>
            <g id="string-light">
                <path d="M 0,0 Q 150,50 300,0" fill="none" stroke="var(--loading-building-front-top)" strokeWidth="2" />
                {BULBS.map(([x, y, r]) => (
                    <circle key={x} cx={x} cy={y} r={r * 3.2} fill="url(#ls-bulb-glow)" />
                ))}
                <path
                    d={BULBS.map(([x, y, r]) => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`).join("")}
                    fill="var(--loading-flame-mid)"
                />
            </g>

            {/* Autumn motifs */}
            <path id="ls-crown-shape" d={CROWN} />
            <use id="ls-crown" href="#ls-crown-shape" fill="url(#ls-crown-grad)" />
            <g id="ls-crown-rimmed">
                <use href="#ls-crown-shape" x="-1.8" y="-1.8" fill="var(--loading-rim)" opacity=".25" />
                <use href="#ls-crown" />
            </g>
            <g id="ls-chochin">
                <circle cy="10" r="17" fill="url(#ls-chochin-glow)" />
                <ellipse cy="10" rx="5.4" ry="6.6" fill="url(#ls-chochin-body)" />
                <path d="M-5,7H5M-5.4,10H5.4M-5,13H5" stroke="#6a1006" strokeWidth=".5" opacity=".6" />
                <path d="M-0.5,0h1v3h-1zM-3.6,2.4h7.2v2h-7.2zM-3.2,16h6.4v1.8h-6.4z" fill="#1a0a06" />
            </g>
            <g id="ls-hoshigaki">
                <path d="M0,0V44" stroke="#2a1a10" strokeWidth=".8" />
                <path d={HOSHIGAKI} fill="var(--ls-persimmon)" />
            </g>
            {/* Falling leaves: body takes the sprite's fill, one half shaded, veins in the sprite's --vein */}
            <path id="ls-maple" d={MAPLE_LEAF} />
            <path id="ls-ginkgo" d={GINKGO_LEAF} />
            <g id="ls-maple-art">
                <use href="#ls-maple" />
                <path d={MAPLE_HALF} fill="#000" stroke="none" opacity=".2" />
                <path d={MAPLE_VEINS} fill="none" stroke="var(--vein)" strokeWidth=".6" strokeLinecap="round" />
            </g>
            <g id="ls-ginkgo-art">
                <use href="#ls-ginkgo" />
                <path d={GINKGO_HALF} fill="#000" stroke="none" opacity=".2" />
                <path d={GINKGO_VEINS} fill="none" stroke="var(--vein)" strokeWidth=".5" strokeLinecap="round" />
            </g>
            <g id="ls-maple-art-blur" filter="url(#ls-blur-leaf)"><use href="#ls-maple-art" /></g>
            <g id="ls-ginkgo-art-blur" filter="url(#ls-blur-leaf)"><use href="#ls-ginkgo-art" /></g>
        </defs>
    );
}
