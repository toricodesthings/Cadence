import {
    BEACON,
    Grad,
    LAND_H as H,
    LAND_W as W,
    Massifs,
    Mist,
    bankFill,
    grove,
    house,
    ridgeFill,
    ridgeLine,
    scatter,
} from "~/components/hero/HeroLandscapeScene";
import { cssVars, n1, pt, risingEdges, yAt, type Pt } from "~/lib/geometry";

const FAR = ridgeLine([
    [0, 150],
    [220, 132],
    [430, 158],
    [640, 140],
    [860, 166],
    [1080, 150],
    [1300, 168],
    [1520, 140],
    [1740, 160],
    [1920, 138],
]);
const MID_W = ridgeLine([
    [0, 186],
    [180, 176],
    [380, 192],
    [560, 188],
    [700, 200],
    [800, 214],
    [860, 234],
]);
const MID_E = ridgeLine([
    [1100, 234],
    [1180, 212],
    [1300, 196],
    [1480, 184],
    [1680, 196],
    [1920, 180],
]);
const WATER = 208;
const NEAR_W = ridgeLine([
    [0, 236],
    [160, 226],
    [360, 240],
    [520, 236],
    [660, 246],
    [760, 262],
    [820, 302],
]);
const NEAR_E = ridgeLine([
    [1240, 302],
    [1300, 262],
    [1420, 244],
    [1600, 234],
    [1760, 246],
    [1920, 238],
]);
const KNOLL = ridgeLine([
    [180, 320],
    [250, 268],
    [340, 252],
    [440, 256],
    [530, 272],
    [600, 320],
]);

const FAR_TREES =
    grove(FAR, 680, 12, 180, 11, 83) + grove(FAR, 1230, 16, 240, 12, 89) + scatter(FAR, 180, 480, 7, 8, 109);
const MID_TREES =
    grove(MID_W, 210, 18, 220, 17, 61) +
    grove(MID_W, 610, 10, 135, 15, 97) +
    grove(MID_E, 1220, 9, 100, 15, 101) +
    grove(MID_E, 1560, 20, 240, 18, 67);
const NEAR_TREES =
    grove(NEAR_W, 196, 8, 130, 56, 71) +
    grove(NEAR_W, 610, 5, 56, 21, 73) +
    scatter(NEAR_W, 500, 580, 3, 18, 113) +
    grove(NEAR_E, 1290, 5, 46, 23, 103) +
    grove(NEAR_E, 1630, 6, 64, 28, 107) +
    grove(NEAR_E, 1730, 8, 130, 58, 79);

const VILLAGE = [
    house(NEAR_W, 300, 20, 9, 2, 1),
    house(NEAR_W, 330, 26, 12, 5, 1),
    house(NEAR_W, 368, 18, 9, 0, 1),
    house(NEAR_W, 404, 28, 13, 4, 2),
    house(NEAR_W, 444, 20, 10, 1, 1),
    house(NEAR_W, 474, 16, 8, 3, 1),
];

const HAMLET = [
    house(NEAR_E, 1330, 30, 16, 2, 2),
    house(NEAR_E, 1390, 42, 22, 0, 3),
    house(NEAR_E, 1452, 28, 15, 4, 2),
    house(NEAR_E, 1512, 36, 19, 1, 2),
    house(NEAR_E, 1580, 24, 13, 5, 1),
];

const HOUSES = [...VILLAGE, ...HAMLET];

const STRING = { a: [1352, 246] as Pt, b: [1530, 240] as Pt, sag: 5 };
const STRING_WIRE = `M${pt(...STRING.a)}Q${pt((STRING.a[0] + STRING.b[0]) / 2, (STRING.a[1] + STRING.b[1]) / 2 + STRING.sag * 2)} ${pt(...STRING.b)}`;
const BULBS: Pt[] = Array.from({ length: 7 }, (_, i) => {
    const t = (i + 1) / 8;
    const u = 1 - t;
    const mid: Pt = [(STRING.a[0] + STRING.b[0]) / 2, (STRING.a[1] + STRING.b[1]) / 2 + STRING.sag * 2];
    return [
        n1(u * u * STRING.a[0] + 2 * u * t * mid[0] + t * t * STRING.b[0]),
        n1(u * u * STRING.a[1] + 2 * u * t * mid[1] + t * t * STRING.b[1] + 2),
    ];
});

const BULB_AT = BULBS.map(([x, y], k) => ({
    dx: n1(((x - W / 2) / W) * 100),
    b: n1(((H - y) / H) * 100),
    k,
}));

const SHORE: readonly Pt[] = [
    [720, yAt(MID_W, 720) - 4],
    [1262, yAt(MID_E, 1262) - 4],
];
const SHRINE: Pt = [W - BEACON[0], BEACON[1]];

const LIGHTS: readonly (readonly [number, number, number])[] = [
    [SHRINE[0], SHRINE[1], 1.3],
    ...VILLAGE.flatMap((c) => c.windows.map(([x, y]) => [x, y, 1.4] as const)),
    ...SHORE.map(([x, y]) => [x, y, 1.4] as const),
];

const REFLECTIONS: readonly (readonly [number, number])[] = [
    [SHORE[0][0], 22],
    [SHORE[1][0], 22],
];

const BOATS = [
    { x: 1011, y: 232, s: 1, cls: "fl-boat-near" },
    { x: 902, y: 222, s: 0.7, cls: "fl-boat-far" },
];

const SMOKE = HAMLET.filter((h) => h.chimney).map(({ chimney }, k) => ({
    dx: n1(((chimney![0] - W / 2) / W) * 100),
    b: n1(((H - chimney![1]) / H) * 100),
    k,
}));

const BAND = {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "xMidYMax slice",
    "aria-hidden": true,
    focusable: "false",
} as const;

export function FinaleLandScene() {
    return (
        <>
            <div className="finale-land-scene">
                <svg {...BAND}>
                    <defs>
                        <Grad id="fl-far" top="var(--hero-land-far)" base="var(--hero-land-haze)" />
                        <Grad id="fl-mid" top="var(--hero-land-mid)" base="var(--hero-land-far)" />
                        <Grad id="fl-near" top="var(--hero-land-near)" base="var(--color-twilight-void)" />
                        <Grad
                            id="fl-knoll"
                            top="color-mix(in srgb, var(--hero-land-near) 60%, var(--color-twilight-void))"
                            base="var(--color-twilight-void)"
                        />
                        <Grad
                            id="fl-lake"
                            top="color-mix(in srgb, var(--hero-land-haze) 45%, var(--hero-land-far))"
                            base="var(--color-twilight-void)"
                        />
                        <Mist id="fl-mist" color="var(--hero-land-haze)" />
                        <radialGradient id="fl-dawn">
                            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".24" />
                            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="fl-hearth">
                            <stop offset="0" stopColor="var(--hero-sigil-orange)" stopOpacity=".2" />
                            <stop offset=".45" stopColor="var(--hero-sigil-coral)" stopOpacity=".07" />
                            <stop offset="1" stopColor="var(--hero-sigil-coral)" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="fl-moonwash">
                            <stop offset="0" stopColor="var(--hero-moon-halo)" stopOpacity=".14" />
                            <stop offset="1" stopColor="var(--hero-moon-halo)" stopOpacity="0" />
                        </radialGradient>
                    </defs>

                    <Massifs id="fl" flip cloud={0.6} />
                    <ellipse cx="1500" cy="130" rx="320" ry="56" fill="url(#fl-moonwash)" />
                    <path d={ridgeFill(FAR) + FAR_TREES} fill="url(#fl-far)" />
                    <path
                        d={risingEdges(FAR)}
                        fill="none"
                        stroke="var(--hero-land-rim)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        opacity=".18"
                    />
                    <rect y="132" width={W} height="70" fill="url(#fl-mist)" opacity=".55" />

                    <path d={bankFill(MID_W) + bankFill(MID_E) + MID_TREES} fill="url(#fl-mid)" />

                    <rect y={WATER} width={W} height={H - WATER + 2} fill="url(#fl-lake)" />
                    <ellipse cx="1000" cy={WATER + 6} rx="380" ry="12" fill="url(#fl-dawn)" />
                    <ellipse cx="1110" cy="251" rx="175" ry="33" fill="url(#fl-hearth)" />
                    <ellipse
                        cx="980"
                        cy="215"
                        rx="300"
                        ry="7"
                        fill="var(--hero-land-rim)"
                        opacity=".1"
                        filter="url(#fl-cloud)"
                    />
                    <path
                        d={`M660,${WATER + 14}H880M1040,${WATER + 20}H1300M760,${WATER + 30}H960M1110,${WATER + 42}H1250M880,260H985M1045,272H1160M810,283H925`}
                        stroke="var(--hero-land-rim)"
                        strokeWidth=".8"
                        strokeLinecap="round"
                        opacity=".2"
                    />

                    <path
                        d="M1088,213.5H1132M1150,215.5H1206M1112,217.5H1168M1196,212.5H1232"
                        stroke="var(--hero-moon)"
                        strokeWidth="1"
                        strokeLinecap="round"
                        opacity=".4"
                    />

                    <path
                        d={bankFill(NEAR_W) + bankFill(NEAR_E) + NEAR_TREES + HOUSES.map((c) => c.body).join("")}
                        fill="url(#fl-near)"
                    />
                    <ellipse cx="390" cy="242" rx="155" ry="45" fill="url(#fl-hearth)" />
                    <ellipse cx="1435" cy="244" rx="190" ry="60" fill="url(#fl-hearth)" />
                    <path
                        d="M1325,272Q1410,254 1490,264T1610,256"
                        fill="none"
                        stroke="var(--hero-lamp)"
                        strokeWidth="1.2"
                        opacity=".18"
                    />
                    <path
                        d={HAMLET.map((c) => c.ridge).join("")}
                        fill="none"
                        stroke="var(--hero-land-rim)"
                        strokeWidth="1"
                        strokeLinecap="round"
                        opacity=".3"
                    />
                    <path d={STRING_WIRE} fill="none" stroke="var(--hero-land-near)" strokeWidth=".9" opacity=".8" />
                    <path d={bankFill(KNOLL)} fill="url(#fl-knoll)" />
                </svg>

                <svg {...BAND} className="hero-lamps">
                    <defs>
                        <radialGradient id="fl-lamp">
                            <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".55" />
                            <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    {LIGHTS.map(([x, y, r], k) => (
                        <g key={k} className="fl-lamp" style={cssVars({ "--k": k })}>
                            <circle cx={x} cy={y} r={r * 5.5} fill="url(#fl-lamp)" />
                            <circle cx={x} cy={y} r={r} fill="var(--hero-lamp)" />
                        </g>
                    ))}
                    {HAMLET.flatMap((c, i) =>
                        c.windows.map(([x, y], j) => (
                            <g key={`${i}-${j}`} className="fl-lamp" style={cssVars({ "--k": LIGHTS.length + i })}>
                                <circle cx={x} cy={y + 1} r="9" fill="url(#fl-lamp)" />
                                <rect
                                    x={n1(x - 1.8)}
                                    y={n1(y - 1.4)}
                                    width="3.6"
                                    height="4.4"
                                    rx=".6"
                                    fill="var(--hero-lamp)"
                                />
                            </g>
                        )),
                    )}
                </svg>

                <div className="fl-bulbs">
                    {BULB_AT.map(({ dx, b, k }) => (
                        <span key={k} style={cssVars({ "--dx": `${dx}%`, "--b": `${b}%`, "--k": k })} />
                    ))}
                </div>

                {BOATS.map(({ x, y, s, cls }) => (
                    <div key={cls} className={`fl-boat ${cls}`}>
                        <svg {...BAND}>
                            <g transform={`translate(${x} ${y}) scale(${s})`}>
                                <rect
                                    x="-1.5"
                                    y="2"
                                    width="3"
                                    height="18"
                                    rx="1.5"
                                    fill="url(#fl-streak)"
                                    opacity=".7"
                                />
                                <path d="M-23,0Q0,7 24,0L18,5Q0,9 -17,5Z" fill="var(--hero-land-near)" />
                                <path d="M0,0V-10" stroke="var(--hero-land-near)" strokeWidth="1.4" />
                                <circle cy="-10" r="9" fill="url(#fl-lamp)" />
                                <circle cy="-10" r="1.6" fill="var(--hero-lamp)" />
                            </g>
                        </svg>
                    </div>
                ))}

                <div className="fl-reflect hero-lamps">
                    {REFLECTIONS.map(([x, len], k) => (
                        <svg key={x} {...BAND} className="fl-shimmer" style={cssVars({ "--k": k })}>
                            {k === 0 && (
                                <defs>
                                    <linearGradient id="fl-streak" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0" stopColor="var(--hero-lamp)" stopOpacity=".5" />
                                        <stop offset="1" stopColor="var(--hero-lamp)" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                            )}
                            <rect x={x - 1.5} y={WATER + 1} width="3" height={len} rx="1.5" fill="url(#fl-streak)" />
                        </svg>
                    ))}
                </div>

                <div className="fl-smoke">
                    {SMOKE.flatMap(({ dx, b, k }) =>
                        [0, 1, 2].map((i) => (
                            <span
                                key={`${k}-${i}`}
                                style={cssVars({ "--dx": `${dx}%`, "--b": `${b}%`, "--k": k * 3 + i })}
                            />
                        )),
                    )}
                </div>
            </div>
        </>
    );
}
