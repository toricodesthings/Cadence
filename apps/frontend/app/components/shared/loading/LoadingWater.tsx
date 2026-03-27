export function LoadingWater() {
    return (
        <>
            <path
                d="M 0,1000 Q 480,980 960,1000 T 1920,1000 L 1920,1080 L 0,1080 Z"
                fill="url(#water-grad)"
            />
            {/* Ripple accents */}
            <path
                d="M 100,1020 Q 300,1010 500,1020 T 900,1020 T 1300,1020 T 1800,1020"
                fill="none"
                stroke="var(--loading-water-top, #2B4666)"
                strokeWidth="2"
                opacity="0.3"
                className="water-anim"
            />
            <path
                d="M 200,1040 Q 400,1030 600,1040 T 1000,1040 T 1400,1040 T 1900,1040"
                fill="none"
                stroke="var(--loading-water-top, #2B4666)"
                strokeWidth="1"
                opacity="0.2"
                className="water-anim"
                style={{ animationDelay: "-4s" }}
            />
            {/* Water reflections */}
            <g
                transform="translate(660, 1000)"
                stroke="var(--accent-primary, #FFB84D)"
                strokeWidth="2.5"
                opacity="0.4"
                strokeLinecap="round"
                className="water-anim"
            >
                <line x1="120" y1="10" x2="160" y2="10" filter="url(#lantern-glow-core)" className="star s-2" />
                <line x1="130" y1="20" x2="150" y2="20" className="star s-2" opacity="0.7" />
                <line x1="420" y1="5" x2="460" y2="5" filter="url(#lantern-glow-core)" className="star s-4" />
                <line x1="415" y1="15" x2="465" y2="15" className="star s-4" opacity="0.6" />
                <line x1="430" y1="25" x2="450" y2="25" className="star s-4" opacity="0.4" />
            </g>
        </>
    );
}
