import type { Season } from "../../../lib/themes/season";
import type { LoadingMode } from "../Loading";

/**
 * Lanterns with depth-driven parallax.
 * Three planes: far (small, blurred, slow), mid, near (large, sharp, fast).
 * Each uses a prime-number animation duration to prevent sync.
 */
interface LanternConfig {
    left: string;
    scale: number;
    blur: number;
    opacity: number;
    duration: number;
    delay: number;
    /** 0 = far background, 1 = near foreground */
    depth: number;
}

const ALL_LANTERNS: LanternConfig[] = [
    // Far plane — small, blurred, slow, dim
    { left: "12%",  scale: 0.30, blur: 3.0, opacity: 0.35, duration: 43, delay: 6,  depth: 0.05 },
    { left: "52%",  scale: 0.35, blur: 2.5, opacity: 0.40, duration: 47, delay: 18, depth: 0.1 },
    // Mid-far
    { left: "82%",  scale: 0.50, blur: 1.8, opacity: 0.55, duration: 37, delay: 3,  depth: 0.3 },
    { left: "34%",  scale: 0.55, blur: 1.5, opacity: 0.60, duration: 41, delay: 10, depth: 0.35 },
    // Mid
    { left: "66%",  scale: 0.75, blur: 0.8, opacity: 0.75, duration: 31, delay: 7,  depth: 0.5 },
    { left: "22%",  scale: 0.80, blur: 0.5, opacity: 0.80, duration: 29, delay: 0,  depth: 0.55 },
    // Near — large, sharp, fast
    { left: "46%",  scale: 1.15, blur: 0,   opacity: 1.0,  duration: 23, delay: 12, depth: 0.85 },
    { left: "76%",  scale: 1.35, blur: 0,   opacity: 1.0,  duration: 19, delay: 2,  depth: 1.0 },
];

function getLanternCount(season: Season, mode: LoadingMode): number {
    const base: Record<Season, number> = {
        spring: 5,
        summer: 8,
        autumn: 8,
        winter: 6,
    };
    return mode === "daylight" ? Math.max(3, base[season] - 2) : base[season];
}

interface Props {
    season: Season;
    mode: LoadingMode;
}

export function LoadingLanterns({ season, mode }: Props) {
    const count = getLanternCount(season, mode);
    const lanterns = ALL_LANTERNS.slice(0, count);
    const modeOpacity = mode === "daylight" ? 0.5 : 1;

    return (
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: modeOpacity }}>
            {lanterns.map((l, i) => (
                <div
                    key={i}
                    style={{
                        left: l.left,
                        zIndex: Math.round(l.depth * 10),
                    }}
                    className="absolute lantern-wrap"
                >
                    <style>{`
                        .lantern-wrap-${i} { 
                            animation: float-up ${l.duration}s ${l.delay}s infinite linear;
                        }
                    `}</style>
                    <div
                        className={`lantern-wrap-${i} lantern-obj`}
                        style={{
                            transform: `scale(${l.scale})`,
                            filter: l.blur > 0 ? `blur(${l.blur}px)` : undefined,
                            opacity: l.opacity,
                        }}
                    >
                        <svg
                            width="100"
                            height="130"
                            viewBox="-50 -50 100 130"
                        >
                            <use href="#lantern" />
                        </svg>
                    </div>
                </div>
            ))}
        </div>
    );
}
