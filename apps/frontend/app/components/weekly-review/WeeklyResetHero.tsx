export function WeeklyResetHero({ className = "" }: { className?: string }) {
    return (
        <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
            <svg viewBox="0 0 300 170" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                <HeroDefs />
                <HeroAmbience />
                <HeroFlower />
            </svg>
        </div>
    );
}

function HeroDefs() {
    return (
        <defs>
            <radialGradient id="wr-cool" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent-secondary)" stopOpacity="0.08" />
                <stop offset="70%" stopColor="var(--accent-secondary)" stopOpacity="0.02" />
                <stop offset="100%" stopColor="var(--accent-secondary)" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="wr-bloom-glow" cx="150" cy="75" r="70" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.12" />
                <stop offset="45%" stopColor="var(--accent-primary)" stopOpacity="0.04" />
                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="wr-horizon" cx="50%" cy="85%" r="60%">
                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.10" />
                <stop offset="60%" stopColor="var(--accent-primary)" stopOpacity="0.02" />
                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="wr-petal" x1="0" y1="0" x2="0" y2="1">
                <stop
                    offset="0%"
                    stopColor="color-mix(in srgb, var(--accent-primary) 65%, var(--color-twilight-text))"
                />
                <stop offset="100%" stopColor="var(--accent-primary)" />
            </linearGradient>

            <linearGradient id="wr-petal-inner" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-twilight-text)" stopOpacity="0.75" />
                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.15" />
            </linearGradient>

            <linearGradient id="wr-leaf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-secondary)" />
                <stop
                    offset="100%"
                    stopColor="color-mix(in srgb, var(--accent-secondary) 70%, var(--accent-primary) 30%)"
                />
            </linearGradient>
        </defs>
    );
}

function HeroAmbience() {
    return (
        <>
            <ellipse cx="150" cy="85" rx="125" ry="48" fill="url(#wr-cool)" />
            <ellipse cx="150" cy="135" rx="110" ry="25" fill="url(#wr-horizon)" />

            <ellipse cx="150" cy="75" rx="65" ry="42" fill="url(#wr-bloom-glow)" />

            <ellipse cx="150" cy="138" rx="45" ry="7" fill="var(--accent-primary)" opacity="0.04" />
            <ellipse cx="150" cy="137" rx="24" ry="3.5" fill="var(--accent-secondary)" opacity="0.05" />

            <g opacity="0.75">
                <circle
                    className="weekly-reset-drift"
                    cx="115"
                    cy="105"
                    r="1"
                    fill="var(--accent-primary)"
                    style={{ animationDelay: "0s" }}
                />
                <circle
                    className="weekly-reset-drift"
                    cx="132"
                    cy="82"
                    r="1.2"
                    fill="var(--accent-secondary)"
                    style={{ animationDelay: "1.8s" }}
                />
                <circle
                    className="weekly-reset-drift"
                    cx="174"
                    cy="98"
                    r="1"
                    fill="var(--accent-primary)"
                    style={{ animationDelay: "3s" }}
                />
                <circle
                    className="weekly-reset-drift"
                    cx="186"
                    cy="68"
                    r="1.3"
                    fill="var(--accent-secondary)"
                    style={{ animationDelay: "4.4s" }}
                />
            </g>
        </>
    );
}

function HeroFlower() {
    return (
        <g
            className="weekly-reset-sway"
            style={{
                transformOrigin: "150px 136px",
            }}
        >
            <path
                d="M150 136
                   C146 122 147 108 151 96
                   C153 87 152 78 150 68"
                stroke="var(--accent-primary)"
                strokeOpacity="0.85"
                strokeWidth="1.8"
                strokeLinecap="round"
            />

            <path
                d="M149 122
                   C130 124 118 115 114 104
                   C131 103 144 111 149 122 Z"
                fill="url(#wr-leaf)"
                stroke="var(--accent-primary)"
                strokeOpacity="0.12"
                strokeWidth="0.5"
            />

            <path
                d="M151 116
                   C169 118 180 109 184 97
                   C168 98 156 105 151 116 Z"
                fill="url(#wr-leaf)"
                stroke="var(--accent-primary)"
                strokeOpacity="0.12"
                strokeWidth="0.5"
            />
            <FlowerPetals />
        </g>
    );
}

function FlowerPetals() {
    return (
        <>
            <path
                d="M150 72
                   C135 68 126 54 129 38
                   C143 44 149 57 150 72 Z"
                fill="url(#wr-petal)"
                opacity="0.75"
            />
            <path
                d="M150 72
                   C165 68 174 54 171 38
                   C157 44 151 57 150 72 Z"
                fill="url(#wr-petal)"
                opacity="0.75"
            />

            <path
                d="M150 85
                   C134 77 124 61 127 44
                   C145 51 151 68 150 85 Z"
                fill="url(#wr-petal)"
            />

            <path
                d="M150 85
                   C166 77 176 61 173 44
                   C155 51 149 68 150 85 Z"
                fill="url(#wr-petal)"
            />

            <path
                d="M150 88
                   C143 72 143 51 150 31
                   C157 51 157 72 150 88 Z"
                fill="url(#wr-petal)"
            />

            <path
                d="M150 83
                   C146 70 146 54 150 41
                   C154 54 154 70 150 83 Z"
                fill="url(#wr-petal-inner)"
            />

            <circle cx="150" cy="87" r="2.2" fill="color-mix(in srgb, var(--accent-primary) 40%, white)" />

            <path
                d="M150 78 C149.3 66 149.3 52 150 42"
                stroke="white"
                strokeOpacity="0.25"
                strokeWidth="0.75"
                strokeLinecap="round"
            />
        </>
    );
}
