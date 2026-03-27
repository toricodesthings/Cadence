import type { Season } from "../../../lib/themes/season";

export function LoadingMountains({ season }: { season: Season }) {
    const showSnowCaps = season === "winter";

    return (
        <>
            {/* Furthest */}
            <path
                d="M0,1080 L0,650 Q200,550 400,680 T800,600 T1200,700 T1600,530 T1920,720 L1920,1080 Z"
                fill="url(#mountain-back-1)"
            />
            {/* Mid-Far */}
            <path
                d="M0,1080 L0,720 Q150,650 350,780 T750,700 T1150,800 T1550,660 T1920,800 L1920,1080 Z"
                fill="url(#mountain-back-2)"
            />
            {/* Midground */}
            <path
                d="M0,1080 L0,860 Q250,790 450,920 T950,830 T1350,960 T1750,840 L1920,950 L1920,1080 Z"
                fill="url(#mountain-mid)"
            />

            {/* Snow caps for winter */}
            {showSnowCaps && (
                <g opacity="0.7">
                    {/* Snow on furthest peaks */}
                    <path
                        d="M380,680 Q390,665 410,680 T440,678"
                        fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="4" opacity="0.5"
                    />
                    <path
                        d="M780,600 Q800,580 820,600 T850,598"
                        fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="5" opacity="0.6"
                    />
                    <path
                        d="M1580,530 Q1600,510 1620,530 T1650,528"
                        fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="5" opacity="0.6"
                    />
                    {/* Snow on mid peaks */}
                    <path
                        d="M330,780 Q350,760 370,780"
                        fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="4" opacity="0.4"
                    />
                    <path
                        d="M1530,660 Q1550,640 1570,660"
                        fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="4" opacity="0.4"
                    />
                </g>
            )}

            {/* Spring mist layer */}
            {season === "spring" && (
                <g>
                    <rect x="0" y="850" width="1920" height="230" fill="var(--loading-sky-horizon)" opacity="0.12" />
                    <ellipse cx="960" cy="900" rx="800" ry="80" fill="var(--loading-sky-horizon)" opacity="0.08" />
                </g>
            )}
        </>
    );
}
