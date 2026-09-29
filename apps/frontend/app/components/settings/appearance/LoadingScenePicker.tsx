import { useId } from "react";
import { Check, Flower2, Leaf, RefreshCw, Snowflake, Sun, type LucideIcon } from "lucide-react";
import { cn } from "../../../lib/utils";
import { resolveLoadingSeason, type Season } from "../../../lib/themes/season";

type LoadingSeasonPref = "auto" | Season;

/** Twilight values from loading-tokens.css, pared down to sky, light and three ridges. */
const SCENES: Record<Season, {
    label: string; desc: string; icon: LucideIcon;
    sky: [string, string, string]; ridges: [string, string, string]; light?: string; detail: string;
}> = {
    spring: {
        label: "Spring", desc: "Misty rain at dusk", icon: Flower2,
        sky: ["#0b1220", "#162838", "#2a3e52"], ridges: ["#1a2838", "#0e1a28", "#060e18"], detail: "#8aaccc",
    },
    summer: {
        label: "Summer", desc: "Warm summer evening", icon: Sun,
        sky: ["#1a3556", "#366088", "#958554"], ridges: ["#3c6071", "#254a4e", "#17302e"], light: "#fae6a1", detail: "#ffec98",
    },
    autumn: {
        label: "Autumn", desc: "Harvest-moon night", icon: Leaf,
        sky: ["#171638", "#2e1a2a", "#4a2320"], ridges: ["#2c2232", "#241e30", "#1d1a26"], light: "#f6e7b8", detail: "#ff8008",
    },
    winter: {
        label: "Winter", desc: "Moonlit snowscape", icon: Snowflake,
        sky: ["#070c22", "#0a1428", "#15253e"], ridges: ["#0e1a30", "#080f20", "#040812"], light: "#e8f0ff", detail: "#d0e0f0",
    },
};

const SEASON_ORDER: readonly Season[] = ["spring", "summer", "autumn", "winter"];

function MiniScene({ season, className }: { season: Season; className?: string }) {
    const s = SCENES[season];
    const id = useId();
    // Summer's sun sits low on the horizon; the moons ride high.
    const light = season === "summer" ? { x: 112, y: 60, r: 7 } : { x: 116, y: 24, r: 5 };

    return (
        <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden className={cn("block h-full w-full", className)}>
            <defs>
                <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={s.sky[0]} />
                    <stop offset=".55" stopColor={s.sky[1]} />
                    <stop offset="1" stopColor={s.sky[2]} />
                </linearGradient>
                <radialGradient id={`${id}glow`}>
                    <stop offset="0" stopColor={s.light ?? s.detail} stopOpacity=".45" />
                    <stop offset="1" stopColor={s.light ?? s.detail} stopOpacity="0" />
                </radialGradient>
                <radialGradient id={`${id}dot`}>
                    <stop offset="0" stopColor={s.detail} stopOpacity=".9" />
                    <stop offset="1" stopColor={s.detail} stopOpacity="0" />
                </radialGradient>
            </defs>
            <rect width="160" height="100" fill={`url(#${id}sky)`} />

            {s.light ? (
                <>
                    <circle cx={light.x} cy={light.y} r={light.r * 4} fill={`url(#${id}glow)`} />
                    <circle cx={light.x} cy={light.y} r={light.r} fill={s.light} opacity=".9" />
                </>
            ) : (
                // Spring has no key light: a band of mist instead.
                <ellipse cx="80" cy="62" rx="90" ry="14" fill={s.detail} opacity=".12" />
            )}

            <path d="M0 68 C22 56 38 52 58 60 S98 50 120 56 S150 54 160 58 V100 H0Z" fill={s.ridges[0]} opacity=".85" />
            {season === "winter" && (
                <path d="M0 68 C22 56 38 52 58 60 S98 50 120 56 S150 54 160 58 V61 C150 57 140 57 120 59 S80 53 58 63 S20 60 0 71Z" fill={s.light} opacity=".22" />
            )}
            <path d="M0 78 C28 68 50 66 76 74 S126 66 160 72 V100 H0Z" fill={s.ridges[1]} />
            <path d="M0 90 C34 82 70 84 96 88 S140 84 160 86 V100 H0Z" fill={s.ridges[2]} />

            {season === "spring" && (
                <g stroke={s.detail} strokeWidth=".6" strokeLinecap="round" opacity=".3">
                    {[18, 44, 70, 98, 126, 148].map((x, i) => (
                        <line key={x} x1={x} y1={10 + (i % 3) * 9} x2={x - 3} y2={22 + (i % 3) * 9} />
                    ))}
                </g>
            )}
            {season === "summer" && [[36, 70], [62, 64], [134, 76]].map(([x, y]) => (
                <circle key={x} cx={x} cy={y} r="2.2" fill={`url(#${id}dot)`} />
            ))}
            {season === "autumn" && [[42, 40], [70, 30]].map(([x, y]) => (
                <g key={x}>
                    <circle cx={x} cy={y} r="7" fill={`url(#${id}dot)`} opacity=".45" />
                    <rect x={x - 1.6} y={y - 2.2} width="3.2" height="4.4" rx="1.2" fill={s.detail} opacity=".85" />
                </g>
            ))}
            {season === "winter" && [[20, 18], [48, 36], [74, 14], [96, 42], [140, 44], [30, 52]].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r=".9" fill={s.detail} opacity=".7" />
            ))}
        </svg>
    );
}

interface LoadingScenePickerProps {
    value: LoadingSeasonPref;
    onChange: (value: LoadingSeasonPref) => void;
}

export function LoadingScenePicker({ value, onChange }: LoadingScenePickerProps) {
    const current = SCENES[resolveLoadingSeason("auto")].label;
    const options: { value: LoadingSeasonPref; label: string; desc: string; icon: LucideIcon }[] = [
        { value: "auto", label: "Auto", desc: `By date · ${current} now`, icon: RefreshCw },
        ...SEASON_ORDER.map((season) => ({ value: season, ...SCENES[season] })),
    ];

    return (
        <div role="group" aria-label="Loading screen scenes" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {options.map((opt) => {
                const selected = value === opt.value;
                const Icon = opt.icon;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        aria-label={`${opt.label} loading scene`}
                        aria-pressed={selected}
                        className={cn(
                            "group flex w-full flex-col gap-2.5 rounded-2xl border p-3 text-left transition-all duration-200",
                            "cursor-pointer",
                            opt.value === "auto" && "col-span-2 sm:col-span-1",
                            selected
                                ? "border-[color:var(--accent-primary)]/40 bg-[color:var(--accent-primary)]/[0.06]"
                                : "border-twilight-border-light bg-white/[0.02] hover:bg-white/[0.04]",
                        )}
                    >
                        <div className="relative flex h-16 w-full overflow-hidden rounded-lg">
                            {opt.value === "auto"
                                ? SEASON_ORDER.map((season) => <MiniScene key={season} season={season} className="flex-1" />)
                                : <MiniScene season={opt.value} />}
                            {selected && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <Check size={18} className="text-white drop-shadow-md" />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Icon
                                size={14}
                                className={cn(
                                    "transition-colors",
                                    selected ? "text-[color:var(--accent-primary)]" : "text-twilight-text-muted",
                                )}
                            />
                            <span className="text-[13px] font-medium text-twilight-text">{opt.label}</span>
                        </div>
                        <span className="text-[11px] leading-tight text-twilight-text-muted">{opt.desc}</span>
                    </button>
                );
            })}
        </div>
    );
}
