import type { Season } from "../../../lib/themes/season";

export function LoadingCityscape({ season }: { season: Season }) {
    const showSnow = season === "winter";

    return (
        <>
            {/* Background Layer City (Smaller, darker) */}
            <g transform="scale(0.85) translate(100, 150)" opacity="0.7">
                <use href="#building-a" x="-100" y="850" />
                <use href="#building-c" x="150" y="820" />
                <use href="#building-b" x="500" y="750" />
                <use href="#building-b" x="1800" y="700" />
                <use href="#building-c" x="1500" y="810" />
            </g>

            {/* Midground Layer City (Side heavy) */}
            <g transform="scale(0.95) translate(50, 40)" opacity="0.9">
                <use href="#building-b" x="-50" y="720" />
                <use href="#building-a" x="250" y="830" />
                <use href="#building-c" x="450" y="880" />
                <use href="#building-a" x="1400" y="860" />
                <use href="#building-b" x="1650" y="720" />
                <use href="#building-c" x="1850" y="880" />
                <use href="#string-light" x="100" y="780" transform="rotate(10 100 780)" />
                <use href="#string-light" x="400" y="860" transform="rotate(-5 400 860)" />
                <use href="#string-light" x="1350" y="850" transform="rotate(-8 1350 850)" />
                <use href="#string-light" x="1600" y="780" transform="rotate(12 1600 750)" />
            </g>

            {/* Hero Foreground Buildings & Docks */}
            <g>
                <use href="#building-b" x="0" y="680" transform="scale(1.2) translate(-20, -50)" />
                <use href="#building-a" x="350" y="900" />
                <use href="#building-b" x="1600" y="680" transform="scale(1.3) translate(50, -50)" />
                <use href="#building-c" x="1400" y="900" />

                {/* Docks framing the water */}
                <g fill="url(#wood-front)">
                    <polygon points="-50,960 250,1050 290,1030 -30,950" />
                    <polygon points="250,980 400,1080 440,1050 280,950" />
                    <polygon points="1950,960 1650,1050 1610,1030 1930,950" />
                    <polygon points="1670,980 1520,1080 1480,1050 1640,950" />
                </g>

                {/* Foreground String Lights */}
                <use href="#string-light" x="-50" y="850" transform="rotate(5 -50 850)" />
                <use href="#string-light" x="250" y="920" transform="scale(0.8) rotate(-15 250 920)" />
                <use href="#string-light" x="1500" y="900" transform="rotate(10 1500 900)" />
            </g>

            {/* Winter snow accumulation on rooftops */}
            {showSnow && (
                <g>
                    {/* Snow on foreground roofs */}
                    <g opacity="0.6" fill="var(--loading-particle-color, #d0e0f0)">
                        {/* Left foreground building roofs */}
                        <path d="M-20,760 Q60,740 140,760 Q200,750 280,770" fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="6" strokeLinecap="round" />
                        <path d="M340,885 Q400,870 460,885" fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="5" strokeLinecap="round" />
                        {/* Right foreground building roofs */}
                        <path d="M1640,760 Q1720,740 1800,760 Q1860,750 1940,770" fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="6" strokeLinecap="round" />
                        <path d="M1400,885 Q1480,870 1560,885" fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="5" strokeLinecap="round" />
                    </g>
                    {/* Snow on dock edges */}
                    <g opacity="0.35" fill="var(--loading-particle-color, #d0e0f0)">
                        <path d="M-50,955 Q100,945 250,960" fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="4" strokeLinecap="round" />
                        <path d="M1650,955 Q1800,945 1950,960" fill="none" stroke="var(--loading-particle-color, #d0e0f0)" strokeWidth="4" strokeLinecap="round" />
                    </g>
                </g>
            )}
        </>
    );
}
