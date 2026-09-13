import { cssVars, n1, rng } from "./loading-geometry";

/*
 * Every season's particle set is in the markup; CSS gates show one (hidden sets
 * don't animate). Motion uses shared keyframes driven by per-element vars.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const s = (v: number, unit = "") => `${n1(v)}${unit}`;

type Tier = "far" | "mid" | "near";

/** Reduced-motion stills: [viewport x %, viewport y %, rotation]. Near/mid stay outside the wordmark column. */
const LEAF_POSES: Record<Tier, readonly (readonly [number, number, number])[]> = {
    far: [[10, 40, 20], [26, 55, -30], [45, 18, 60], [58, 26, -15], [70, 48, 35], [92, 14, -50]],
    mid: [[18, 22, 40], [88, 58, -20], [30, 78, 60]],
    near: [[6, 64, 25], [78, 30, -35]],
};

const LEAVES = (() => {
    const rand = rng(21);
    const counters: Record<Tier, number> = { far: 0, mid: 0, near: 0 };
    return Array.from({ length: 22 }, (_, i) => {
        const tier: Tier = i < 10 ? "far" : i < 20 ? "mid" : "near";
        const idx = counters[tier]++;
        const pose = LEAF_POSES[tier][idx];
        const dur = tier === "far" ? lerp(20, 28, rand()) : tier === "mid" ? lerp(13, 17, rand()) : lerp(7.5, 9, rand());
        // Near leaves spawn only in viewport x 0–35% / 65–100% and drift right, clear of the wordmark column.
        const x = tier === "near" ? (idx === 0 ? 5 : 71) : 2 + rand() * 96;
        const phase = tier === "near" ? (idx === 0 ? 0.35 : 0.7) : rand();
        const size = tier === "far" ? lerp(11, 16, rand()) : tier === "mid" ? lerp(16, 24, rand()) : idx === 0 ? 46 : 60;
        const maple = rand() < 0.7;
        const tone = 1 + Math.floor(rand() * 3);
        const spin = lerp(180, 540, rand()) * (rand() < 0.5 ? -1 : 1);
        const dx = tier === "far" ? lerp(6, 12, rand()) : tier === "mid" ? lerp(8, 14, rand()) : 8;
        const sway = tier === "far" ? lerp(1.5, 3, rand()) : tier === "mid" ? lerp(2, 4, rand()) : 3;
        const ax = lerp(0.6, 1, rand());
        const ay = lerp(0.1, 0.5, rand());
        const hiddenInPortrait = !pose && (tier === "far" || idx < 2);
        const classes = ["ls-leaf", tier === "far" && "is-far", !pose && "ls-rm-hide", hiddenInPortrait && "ls-p-hide"]
            .filter(Boolean)
            .join(" ");
        return {
            classes,
            href: `#ls-${maple ? "maple" : "ginkgo"}-art${tier === "near" ? "-blur" : ""}`,
            style: cssVars({
                "--x": s(x, "%"),
                "--size": s(size, "px"),
                "--c": `var(--ls-leaf-${tone})`,
                "--o": tier === "far" ? s(lerp(0.55, 0.75, rand())) : tier === "mid" ? "0.9" : "1",
                "--dur": s(dur, "s"),
                // Half a swing; heavier near leaves swing faster relative to their fall.
                "--swp": s(dur / (tier === "far" ? 5 : tier === "mid" ? 4 : 3), "s"),
                "--delay": s(-phase * dur, "s"),
                "--dx": s(dx, "vw"),
                "--sway": s(sway, "vw"),
                "--spin": s(spin, "deg"),
                "--ax": s(ax),
                "--ay": s(ay),
                "--px": s(pose ? pose[0] - x : 0, "vw"),
                "--py": s(pose ? pose[1] : -20, "vh"),
                "--pr": s(pose ? pose[2] : 0, "deg"),
            }),
        };
    });
})();

const DROPS = (() => {
    const rand = rng(31);
    return Array.from({ length: 52 }, () => {
        const depth = rand();
        const dur = lerp(3.5, 0.7, depth);
        return cssVars({
            "--x": s(rand() * 100, "%"),
            "--len": s(lerp(25, 88, depth), "px"),
            "--w": s(lerp(1.3, 3, depth), "px"),
            "--o": s(lerp(0.2, 0.65, depth)),
            "--dur": s(dur, "s"),
            "--delay": s(-rand() * dur, "s"),
            "--dx": s(lerp(4, 12, depth) * 4, "px"),
            "--py": s(5 + rand() * 90, "vh"),
        });
    });
})();

const FLAKES = (() => {
    const rand = rng(37);
    return Array.from({ length: 18 }, () => {
        const depth = rand();
        const dur = lerp(18, 4, depth);
        return cssVars({
            "--x": s(rand() * 100, "%"),
            "--size": s(lerp(1.5, 10, depth), "px"),
            "--core": s(lerp(8, 45, depth), "%"),
            "--o": s(lerp(0.2, 0.9, depth)),
            "--dur": s(dur, "s"),
            "--delay": s(-rand() * dur, "s"),
            "--dx": s(lerp(8, 30, depth), "px"),
            "--sway": s(lerp(10, 35, depth) * (rand() < 0.5 ? -1 : 1), "px"),
            "--py": s(5 + rand() * 90, "vh"),
        });
    });
})();

const WISPS = (() => {
    const rand = rng(43);
    return Array.from({ length: 10 }, () => {
        const depth = rand();
        const dur = lerp(22, 8, depth);
        return cssVars({
            "--x": s(rand() * 100, "%"),
            "--size": s(lerp(4, 14, depth), "px"),
            "--o": s(lerp(0.15, 0.6, depth)),
            "--dur": s(dur, "s"),
            "--delay": s(-rand() * dur, "s"),
            "--dx": s(lerp(20, 50, depth), "px"),
            "--py": s(10 + rand() * 80, "vh"),
        });
    });
})();

export function LoadingParticles() {
    return (
        <div className="ls-particles" aria-hidden="true">
            <div className="ls-set ls-autumn">
                {LEAVES.map((leaf, i) => (
                    <span key={i} className={leaf.classes} style={leaf.style}>
                        <svg className="ls-leaf-body" viewBox="-14 -14 28 28">
                            <use href={leaf.href} />
                        </svg>
                    </span>
                ))}
            </div>
            <div className="ls-set ls-spring">
                {DROPS.map((style, i) => (
                    <span key={i} className="ls-drop" style={style} />
                ))}
            </div>
            <div className="ls-set ls-summer">
                {WISPS.map((style, i) => (
                    <span key={i} className="ls-wisp" style={style} />
                ))}
            </div>
            <div className="ls-set ls-winter">
                {FLAKES.map((style, i) => (
                    <span key={i} className="ls-flake" style={style} />
                ))}
            </div>
        </div>
    );
}
