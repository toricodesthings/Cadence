import { useMemo } from "react";
import type { Season } from "../../../lib/themes/season";
import type { LoadingMode } from "../Loading";

/* ── Depth layer system ─────────────────────────────────────────────
   Each particle is assigned to a depth plane (0 = far … 1 = near).
   Depth drives: size scale, fall speed, opacity, blur, and stroke width.
   This creates a convincing parallax / 3D rain/snow/leaf effect.
   ─────────────────────────────────────────────────────────────────── */

type ParticleType = "raindrop" | "wisp" | "leaf" | "snowflake";

interface SeasonConfig {
    type: ParticleType;
    count: number;
    /* Per-depth-layer ranges: [far, near] */
    sizeRange: [number, number];
    opacityRange: [number, number];
    speedRange: [number, number]; // duration seconds — lower = faster
    driftX: [number, number]; // [far, near] horizontal drift px
    blurRange: [number, number]; // [far, near] px
}

function getSeasonConfig(season: Season, mode: LoadingMode): SeasonConfig {
    switch (season) {
        case "spring":
            return {
                type: "raindrop",
                count: mode === "daylight" ? 40 : 30,
                sizeRange: [14, 50],    // far: thin short streaks → near: long thick
                opacityRange: [0.1, 0.5],
                speedRange: [3.5, 0.7], // far slow, near fast
                driftX: [4, 12],
                blurRange: [1.5, 0],
            };
        case "summer":
            return {
                type: "wisp",
                count: mode === "daylight" ? 14 : 10,
                sizeRange: [2, 10],
                opacityRange: [0.15, 0.6],
                speedRange: [22, 8],
                driftX: [20, 50],
                blurRange: [2, 0],
            };
        case "autumn":
            return {
                type: "leaf",
                count: mode === "daylight" ? 14 : 10,
                sizeRange: [5, 20],
                opacityRange: [0.2, 0.7],
                speedRange: [22, 7],
                driftX: [15, 50],
                blurRange: [2, 0],
            };
        case "winter":
            return {
                type: "snowflake",
                count: mode === "daylight" ? 36 : 26,
                sizeRange: [1.5, 10],
                opacityRange: [0.2, 0.9],
                speedRange: [18, 4],
                driftX: [8, 30],
                blurRange: [2.5, 0],
            };
    }
}

function seededRandom(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

/* ── SVG shapes per type ──────────────────────────────────────────── */

function RaindropSVG({ size, strokeW }: { size: number; strokeW: number }) {
    return (
        <svg width={Math.ceil(strokeW + 2)} height={size} viewBox={`0 0 ${strokeW + 2} ${size}`}>
            <line
                x1={strokeW / 2 + 1} y1="0"
                x2={0.5} y2={size}
                stroke="var(--loading-particle-color)"
                strokeWidth={strokeW}
                strokeLinecap="round"
                opacity="0.75"
            />
        </svg>
    );
}

function WispSVG({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="3" fill="var(--loading-particle-color)" opacity="0.5" />
            <circle cx="5" cy="5" r="1.5" fill="white" opacity="0.3" />
        </svg>
    );
}

function LeafSVG({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 20 20">
            <path d="M10,2 Q16,8 14,16 Q10,14 6,16 Q4,8 10,2Z" fill="var(--loading-particle-color)" />
            <line x1="10" y1="2" x2="10" y2="16" stroke="var(--loading-particle-color)" strokeWidth="0.5" opacity="0.5" />
        </svg>
    );
}

function SnowflakeSVG({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="3.5" fill="var(--loading-particle-color)" />
            <circle cx="5" cy="5" r="1.5" fill="white" opacity="0.5" />
        </svg>
    );
}

/* ── Main component ───────────────────────────────────────────────── */

interface Props {
    season: Season;
    mode: LoadingMode;
}

export function LoadingParticles({ season, mode }: Props) {
    const cfg = getSeasonConfig(season, mode);
    const isRain = cfg.type === "raindrop";
    const isWisp = cfg.type === "wisp";

    const particles = useMemo(() => {
        return Array.from({ length: cfg.count }, (_, i) => {
            const r1 = seededRandom(i * 7 + 1);
            const r2 = seededRandom(i * 13 + 3);
            const r3 = seededRandom(i * 19 + 5);
            const r4 = seededRandom(i * 23 + 7);
            const r5 = seededRandom(i * 31 + 11);

            // depth 0 = far background, 1 = near foreground
            const depth = r2;

            const size = lerp(cfg.sizeRange[0], cfg.sizeRange[1], depth);
            const opacity = lerp(cfg.opacityRange[0], cfg.opacityRange[1], depth);
            const duration = lerp(cfg.speedRange[0], cfg.speedRange[1], depth);
            const driftX = lerp(cfg.driftX[0], cfg.driftX[1], depth);
            const blur = lerp(cfg.blurRange[0], cfg.blurRange[1], depth);
            // Rain stroke width scales with depth
            const strokeW = isRain ? lerp(0.8, 2.5, depth) : 0;

            return {
                left: r1 * 100,
                size,
                opacity,
                duration,
                delay: r5 * (isRain ? 4 : 12),
                driftX,
                blur,
                strokeW,
                depth,
                rotation: isRain ? 0 : r3 * 360,
                // Leaves tumble differently at different depths
                tumble: cfg.type === "leaf" ? lerp(180, 540, r4) : 0,
                // Snow & leaf sway amplitude
                sway: (cfg.type === "snowflake" || cfg.type === "leaf")
                    ? lerp(10, 35, depth) * (r4 > 0.5 ? 1 : -1)
                    : 0,
            };
        });
    }, [cfg, isRain]);

    /* ── Per-particle keyframes (unique drift + sway per depth) ──── */
    const keyframeBlocks = useMemo(() => {
        return particles.map((p, i) => {
            const name = `pf-${i}`;
            if (isRain) {
                return `@keyframes ${name} {
                    0%   { transform: translateY(-5vh) translateX(0); opacity: 0; }
                    4%   { opacity: ${p.opacity}; }
                    94%  { opacity: ${p.opacity * 0.8}; }
                    100% { transform: translateY(105vh) translateX(${p.driftX}px); opacity: 0; }
                }`;
            }
            if (isWisp) {
                return `@keyframes ${name} {
                    0%   { transform: translateY(100vh) translateX(0) scale(0.5); opacity: 0; }
                    15%  { opacity: ${p.opacity}; }
                    50%  { transform: translateY(50vh) translateX(${p.driftX}px) scale(1); }
                    85%  { opacity: ${p.opacity * 0.5}; }
                    100% { transform: translateY(-5vh) translateX(${p.driftX * 1.5}px) scale(0.3); opacity: 0; }
                }`;
            }
            // Leaf and snow: sway side-to-side via mid-point translateX
            const swayPx = p.sway;
            return `@keyframes ${name} {
                0%   { transform: translateY(-5vh) translateX(0) rotate(0deg); opacity: 0; }
                8%   { opacity: ${p.opacity}; }
                25%  { transform: translateY(25vh) translateX(${swayPx}px) rotate(${p.tumble * 0.3}deg); }
                50%  { transform: translateY(50vh) translateX(${-swayPx * 0.6}px) rotate(${p.tumble * 0.6}deg); }
                75%  { transform: translateY(75vh) translateX(${swayPx * 0.8}px) rotate(${p.tumble * 0.85}deg); }
                92%  { opacity: ${p.opacity}; }
                100% { transform: translateY(105vh) translateX(${p.driftX}px) rotate(${p.tumble}deg); opacity: 0; }
            }`;
        });
    }, [particles, isRain, isWisp]);

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <style>{keyframeBlocks.join("\n")}</style>
            {particles.map((p, i) => (
                <div
                    key={i}
                    className="absolute"
                    style={{
                        left: `${p.left}%`,
                        zIndex: Math.round(p.depth * 10),
                        filter: p.blur > 0.2 ? `blur(${p.blur.toFixed(1)}px)` : undefined,
                        animation: `pf-${i} ${p.duration.toFixed(2)}s ${p.delay.toFixed(2)}s infinite linear backwards`,
                    }}
                >
                    {isRain ? (
                        <RaindropSVG size={Math.round(p.size)} strokeW={p.strokeW} />
                    ) : isWisp ? (
                        <WispSVG size={Math.round(p.size)} />
                    ) : cfg.type === "leaf" ? (
                        <LeafSVG size={Math.round(p.size)} />
                    ) : (
                        <SnowflakeSVG size={Math.round(p.size)} />
                    )}
                </div>
            ))}
        </div>
    );
}
