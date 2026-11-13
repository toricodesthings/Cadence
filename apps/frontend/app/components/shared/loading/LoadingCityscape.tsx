import { cssVars, MAPLE_LEAF, n1, PIER_EDGES, PIER_PLANKS, placeShape, polyline, smoothThrough, TERRACE_CAPS, yAt } from "./loading-geometry";

/* The near hill: a low knoll between the two towns (its flanks run under the houses to the waterline). */
const MID = smoothThrough(
    [[0, 862], [200, 838], [330, 860], [450, 918], [600, 988], [720, 1000], [800, 962], [880, 908], [960, 856], [1040, 816], [1110, 792],
        [1180, 786], [1240, 802], [1290, 838], [1330, 890], [1370, 948], [1420, 1000], [1560, 1010], [1680, 902], [1750, 842], [1840, 880], [1920, 950]],
    8,
);
const MID_CREST = `${polyline(MID)}L1920,950`;
const MID_D = `M0,1080L${MID_CREST.slice(1)}L1920,1080Z`;

/**
 * Midground maples: one crown symbol varied by scale/flip, drawn just behind the
 * ridge crest so they emerge from the hill; only the topmost few carry a cool rim.
 */
const MAPLES: readonly (readonly [x: number, scale: number, flip: boolean, rim: boolean])[] = [
    [1012, 0.4, true, false], [1058, 0.58, false, true], [1128, 0.72, true, true], [1178, 0.5, false, false],
    [1236, 0.82, false, true], [1296, 0.56, true, false], [700, 0.66, false, false], [772, 0.48, true, false],
    [226, 0.64, true, false], [318, 0.52, false, false], [560, 0.5, false, false], [625, 0.6, true, true],
    [1345, 0.44, false, false], [1450, 0.45, true, false],
];

/** A few maples on the hill's near slope, each with the shadow the moon (upper left) throws down-slope from it. */
const SLOPE_MAPLES: readonly (readonly [x: number, y: number, scale: number, flip: boolean])[] = [
    [1070, 848, 0.56, false], [1262, 862, 0.54, true], [982, 906, 0.38, true],
];
/** The first of them is the sakura, in blossom whatever the season; a few of its petals lie down-slope. */
const SAKURA_X = SLOPE_MAPLES[0][0];
const FALLEN_PETALS = "M1092,872l5,-1.6l-1,3.4ZM1118,880l4.6,1l-3,2.4ZM1060,884l4,-2.4l.6,3.4ZM1140,866l4.4,.4l-2.4,2.8ZM1104,896l4.6,-1l-1.6,3.2Z";

/** The town's own light, breathing: [centre x, centre y, width, height, seconds, delay]. */
const HEARTHS: readonly (readonly [number, number, number, number, number, number])[] = [
    [330, 870, 900, 440, 7.5, -2], [1610, 860, 860, 430, 9.5, -6],
];

const CHOCHIN: readonly (readonly [number, number])[] = [[186, 876], [162, 732], [445, 897], [335, 897], [1380, 902], [1620, 902]];
const HOSHIGAKI: readonly (readonly [number, number])[] = [[355, 901], [425, 901], [1447, 908], [1528, 909]];

const SETTLED: readonly (readonly [number, number, number, number])[] = [
    [362, 884, 30, 1], [398, 876, -50, 2], [430, 888, 80, 1], [1432, 886, 20, 2], [1510, 874, -35, 1],
    [1590, 890, 70, 2], [80, 1031, 10, 1], [210, 1027, -60, 2], [1560, 1021, 45, 1], [1760, 1029, -20, 2],
];
const settledPath = (tone: number) =>
    SETTLED.filter((l) => l[3] === tone).map(([x, y, r]) => placeShape(MAPLE_LEAF, x, y, 0.55, r)).join(" ");

export function LoadingCityscape() {
    return (
        <div className="ls-layer ls-par ls-par-town">
            <svg className="ls-layer" viewBox="0 0 1920 1080">
                <g className="ls-crowns">
                    {MAPLES.map(([x, s, flip, rim]) => (
                        <use
                            key={x}
                            href={rim ? "#ls-crown-rimmed" : "#ls-crown"}
                            transform={`translate(${x} ${n1(yAt(MID, x) + 13 * s)}) scale(${flip ? -s : s} ${s})`}
                        />
                    ))}
                </g>
                <path d={MID_D} fill="url(#mountain-mid)" />
                {/* Crest haze: the near hill meets the warm ridge behind it with a soft step, not a cutout */}
                <path d={MID_CREST} fill="none" stroke="var(--ls-near-base)" strokeWidth="10" opacity=".35" filter="url(#ls-blur-ridge)" />
                <path className="ls-key" d={MID_D} fill="url(#ls-moonlight)" opacity=".55" />
                <path d={MID_D} fill="url(#ls-town-bounce)" />
                {/* The hill's lee flank falls into shade */}
                {/* Winter: the hill lies under snow, deepest at the crest */}
                <path className="ls-winter" d={MID_D} fill="url(#ls-snow-knoll)" />
                <path d={MID_D} fill="url(#ls-lee)" />
                <g className="ls-crowns">
                    <g className="ls-key" fill="var(--loading-sky-zenith)" opacity=".5" filter="url(#ls-blur-mid)">
                        {SLOPE_MAPLES.map(([x, y, sc]) => (
                            <ellipse key={x} cx={x + 46 * sc} cy={y + 12 * sc} rx={70 * sc} ry={11 * sc} />
                        ))}
                    </g>
                    {SLOPE_MAPLES.map(([x, y, sc, flip]) => (
                        <g key={x} transform={`translate(${x} ${y})`}>
                            <rect x={n1(-3 * sc)} y={n1(-8 * sc)} width={n1(6 * sc)} height={n1(18 * sc)} fill="var(--loading-foliage-shade)" />
                            <use href={x === SAKURA_X ? "#ls-sakura" : "#ls-crown-rimmed"} transform={`translate(0 ${n1(-14 * sc)}) scale(${flip ? -sc : sc} ${sc})`} />
                        </g>
                    ))}
                    <path d={FALLEN_PETALS} fill="var(--ls-sakura-lit)" opacity=".7" />
                </g>

                <g className="ls-spring">
                    <rect x="0" y="850" width="1920" height="230" fill="var(--loading-sky-horizon)" opacity="0.12" />
                    <ellipse cx="960" cy="900" rx="800" ry="80" fill="var(--loading-sky-horizon)" opacity="0.08" />
                </g>

                {/* Back town */}
                <g transform="scale(0.85) translate(100, 150)" opacity="0.7">
                    <use href="#building-a-alt" x="-100" y="850" />
                    <use href="#building-c-alt" x="150" y="820" />
                    <use href="#building-b-alt" x="500" y="750" />
                    <g filter="url(#ls-shade-r)">
                        <use href="#building-b" x="1800" y="700" />
                        <use href="#building-c-alt" x="1500" y="810" />
                    </g>
                </g>

                {/* Ground the mid town stands on, with warm spill under the string lights. Inner ends taper
                    down to the waterline along the hill's flank (a hard end read as a cut-out step); a light
                    feather blends the edge into the hill. */}
                <g fill="var(--ls-ground)" filter="url(#ls-blur-midfar)">
                    <path d="M-20,922 Q150,914 330,926 T700,934 C770,938 800,982 880,995 L-20,995 Z" />
                    <path d="M1150,995 C1230,988 1255,936 1330,930 Q1500,918 1700,928 T1940,924 L1940,995 Z" />
                </g>

                {/* Mid town */}
                <g transform="scale(0.95) translate(50, 40)" opacity="0.9">
                    <use href="#building-b" x="-50" y="720" />
                    <use href="#building-a-alt" x="250" y="830" />
                    <use href="#building-c" x="450" y="880" />
                    <use href="#string-light" x="100" y="780" transform="rotate(10 100 780)" />
                    <use href="#string-light" x="400" y="860" transform="rotate(-5 400 860)" />
                    <g className="ls-key" fill="none" stroke="var(--loading-key-edge)" strokeWidth="5" strokeLinecap="round" opacity=".2">
                        <use href="#bb-ridge" x="-50" y="720" />
                        <use href="#ba-ridge" x="250" y="830" />
                        <use href="#bc-ridge" x="450" y="880" />
                    </g>
                    <g filter="url(#ls-shade-r)">
                        <use href="#building-a" x="1400" y="860" />
                        <use href="#building-b-alt" x="1650" y="720" />
                        <use href="#building-c-alt" x="1850" y="880" />
                        <use href="#string-light" x="1350" y="850" transform="rotate(-8 1350 850)" />
                        <use href="#string-light" x="1600" y="780" transform="rotate(12 1600 750)" />
                    </g>
                </g>
                <g fill="url(#ls-spill)">
                    <ellipse cx="300" cy="930" rx="110" ry="16" />
                    <ellipse cx="590" cy="936" rx="90" ry="14" />
                    <ellipse cx="1480" cy="930" rx="110" ry="14" />
                    <ellipse cx="1720" cy="922" rx="90" ry="14" />
                </g>

                {/* Water base, raised to ~985, with warm spill in front of each hero cluster */}
                <use href="#ls-water-shape" fill="url(#water-grad)" />
                <g fill="url(#ls-spill)">
                    <ellipse cx="420" cy="1000" rx="110" ry="10" />
                    <ellipse cx="1520" cy="1000" rx="150" ry="10" />
                    <ellipse cx="130" cy="1062" rx="120" ry="10" />
                </g>

                {/* Ishigaki terraces under the hero clusters */}
                <use href="#ls-terrace-shape" fill="url(#ls-ishigaki)" />
                <path d={TERRACE_CAPS} stroke="var(--loading-rim)" strokeWidth="1" opacity=".3" fill="none" />

                {/* Hero town — also mirrored into the water by the reflections layer */}
                <g id="ls-hero-town">
                    <use href="#building-b" x="0" y="680" transform="scale(1.2) translate(-20, -50)" />
                    <use href="#building-a-alt" x="350" y="900" />
                    <use href="#string-light" x="-50" y="850" transform="rotate(5 -50 850)" />
                    {/* Strung from the tall house's upper side wall down to the neighbour's roof */}
                    <g transform="translate(205 745) rotate(25.6) scale(0.89)">
                        <use href="#string-light" />
                    </g>
                    {CHOCHIN.filter(([x]) => x < 960).map(([x, y]) => (
                        <use key={`${x}-${y}`} href="#ls-chochin" x={x} y={y} />
                    ))}
                    {/* Moon-caught ridge highlight: the one edge that shows where the key light comes from */}
                    <g className="ls-key" fill="none" stroke="var(--loading-key-edge)" strokeWidth="5" strokeLinecap="round" opacity=".2">
                        <use href="#bb-ridge" x="0" y="680" transform="scale(1.2) translate(-20, -50)" />
                        <use href="#ba-ridge" x="350" y="900" />
                    </g>
                    <g filter="url(#ls-shade-r2)">
                        <use href="#building-b" x="1600" y="680" transform="scale(1.3) translate(50, -50)" />
                        <use href="#building-c" x="1400" y="900" />
                        <use href="#string-light" x="1500" y="900" transform="rotate(10 1500 900)" />
                        {CHOCHIN.filter(([x]) => x >= 960).map(([x, y]) => (
                            <use key={`${x}-${y}`} href="#ls-chochin" x={x} y={y} />
                        ))}
                    </g>
                </g>

                {/* Piers: plank decks on posts, one post lantern; water x 500–640 stays clear for the moon column */}
                <use href="#ls-pier-shape" fill="url(#wood-side)" />
                <path d={PIER_PLANKS} stroke="var(--loading-building-front-top)" strokeWidth=".8" opacity=".7" />
                <path d={PIER_EDGES} stroke="var(--loading-rim)" strokeWidth="1" opacity=".3" fill="none" />
                <circle cx="470" cy="971" r="30" fill="url(#ls-bulb-glow)" />
                <rect x="463" y="964" width="14" height="15" rx="2" fill="url(#lan-body-honey)" />
                <path d="M461,964h18M463,979h14" stroke="var(--loading-building-front-top)" strokeWidth="2" />

                <g className="ls-autumn">
                    {HOSHIGAKI.map(([x, y]) => (
                        <use key={x} href="#ls-hoshigaki" x={x} y={y} />
                    ))}
                    <path d={settledPath(1)} fill="var(--ls-leaf-1)" />
                    <path d={settledPath(2)} fill="var(--ls-leaf-2)" />
                </g>

                <g className="ls-winter" fill="none" stroke="var(--loading-particle-color)" strokeLinecap="round">
                    <g opacity="0.35">
                        <path d="M-50,1026 Q200,1016 470,1015" strokeWidth="4" />
                        <path d="M1460,1014 Q1700,1016 1950,1027" strokeWidth="4" />
                    </g>
                </g>
            </svg>
            {HEARTHS.map(([x, y, w, h, dur, delay]) => (
                <div
                    key={x}
                    className="ls-hearth"
                    style={cssVars({ "--x": x - w / 2, "--y": y - h / 2, "--w": w, "--h": h, "--dur": `${dur}s`, "--delay": `${delay}s` })}
                >
                    <div />
                </div>
            ))}
        </div>
    );
}
