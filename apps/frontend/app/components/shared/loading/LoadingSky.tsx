import type { Season } from "../../../lib/themes/season";
import type { LoadingMode } from "../Loading";

const STAR_POSITIONS = [
    { cx: 200, cy: 150, r: 1.5 },
    { cx: 500, cy: 100, r: 1 },
    { cx: 800, cy: 200, r: 2 },
    { cx: 1200, cy: 80, r: 1.5 },
    { cx: 1600, cy: 120, r: 2 },
    { cx: 1800, cy: 250, r: 1 },
    { cx: 350, cy: 300, r: 1.5 },
    { cx: 1000, cy: 250, r: 1.5 },
    { cx: 1400, cy: 350, r: 1 },
    { cx: 150, cy: 400, r: 1 },
    { cx: 1700, cy: 450, r: 1.5 },
    // Extended star field for winter
    { cx: 300, cy: 50, r: 1 },
    { cx: 600, cy: 350, r: 1 },
    { cx: 900, cy: 50, r: 1.5 },
    { cx: 1100, cy: 300, r: 1 },
    { cx: 1300, cy: 150, r: 1 },
    { cx: 1500, cy: 400, r: 1.5 },
    { cx: 100, cy: 250, r: 1 },
    { cx: 750, cy: 120, r: 1 },
    { cx: 1850, cy: 100, r: 1.5 },
];

const SEASON_STAR_COUNT: Record<Season, number> = {
    spring: 6,
    summer: 8,
    autumn: 11,
    winter: 20,
};

interface Props {
    season: Season;
    mode: LoadingMode;
}

export function LoadingSky({ season, mode }: Props) {
    const isDaylight = mode === "daylight";
    const starCount = isDaylight ? 0 : SEASON_STAR_COUNT[season];
    const showMoon = !isDaylight && (season === "autumn" || season === "winter");
    const showSun = isDaylight;

    // Sun position varies by season
    const sunY = season === "summer" ? 180 : season === "winter" ? 320 : 260;

    return (
        <>
            {/* Sky gradient */}
            <rect width="100%" height="100%" fill="url(#sky-grad)" />

            {/* Cloud layer for spring and overcast daylight */}
            {season === "spring" && (
                <g opacity={isDaylight ? 0.5 : 0.2}>
                    <ellipse cx="300" cy="200" rx="200" ry="40" fill="var(--loading-sky-horizon)" opacity="0.4" />
                    <ellipse cx="800" cy="150" rx="250" ry="50" fill="var(--loading-sky-horizon)" opacity="0.35" />
                    <ellipse cx="1400" cy="250" rx="180" ry="35" fill="var(--loading-sky-horizon)" opacity="0.3" />
                    <ellipse cx="1700" cy="180" rx="220" ry="45" fill="var(--loading-sky-mid)" opacity="0.3" />
                    <ellipse cx="500" cy="300" rx="160" ry="30" fill="var(--loading-sky-mid)" opacity="0.25" />
                </g>
            )}

            {/* Sun — daylight mode */}
            {showSun && (
                <g>
                    {/* Sun glow */}
                    <defs>
                        <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor={season === "winter" ? "#e8e0d0" : "#fff8e0"} stopOpacity="1" />
                            <stop offset="20%" stopColor={season === "winter" ? "#d0c8b8" : "#ffe8a0"} stopOpacity="0.7" />
                            <stop offset="50%" stopColor={season === "winter" ? "#b0a890" : "#ffd060"} stopOpacity="0.3" />
                            <stop offset="100%" stopColor="var(--loading-sky-mid)" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <circle cx="1300" cy={sunY} r="120" fill="url(#sun-glow)" />
                    <circle
                        cx="1300"
                        cy={sunY}
                        r="35"
                        fill={season === "winter" ? "#f0e8d8" : "#ffe880"}
                        opacity="0.95"
                    />
                </g>
            )}

            {/* Moon — twilight autumn/winter */}
            {showMoon && (
                <circle
                    cx="1300"
                    cy="220"
                    r="60"
                    fill="url(#moon-glow)"
                    opacity={season === "winter" ? 0.9 : 0.7}
                />
            )}

            {/* Stars — twilight only */}
            {starCount > 0 && (
                <g fill="var(--loading-star-color, #ffffff)">
                    {STAR_POSITIONS.slice(0, starCount).map((star, i) => (
                        <circle
                            key={i}
                            cx={star.cx}
                            cy={star.cy}
                            r={star.r}
                            className={`star s-${(i % 5) + 1}`}
                        />
                    ))}
                </g>
            )}
        </>
    );
}
