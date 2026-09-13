import { cssVars } from "./loading-geometry";

/**
 * Sky lanterns in two depth planes. Far ones (depth < 0.6) rise from behind the
 * town between the ridges; near ones rise from below the screen in front of it.
 * Three wrappers: rise (translate/recede/fade) → static depth scale → sway.
 * Blur is baked with SVG filters inside the sprite; no CSS filter on moving boxes.
 */
interface LanternConfig {
    /** Stage x (%) and portrait stage x (%); lanterns without `xp` are hidden in portrait. */
    x: number;
    xp?: number;
    scale: number;
    opacity: number;
    blur?: "far" | "mid";
    color: "amber" | "honey" | "vermilion";
    duration: number;
    /** 0–1 point in the cycle shown on the first frame (negative delay). */
    phase: number;
    /** Reduced-motion still height in stage units. */
    pose: number;
    optional?: boolean;
    sway?: number;
    flicker?: number;
}

const FAR: readonly LanternConfig[] = [
    { x: 12, scale: 0.3, opacity: 0.35, blur: "far", color: "honey", duration: 43, phase: 0.18, pose: 330, optional: true },
    { x: 63, scale: 0.35, opacity: 0.4, blur: "far", color: "amber", duration: 47, phase: 0.64, pose: 420, optional: true },
    { x: 82, xp: 32, scale: 0.5, opacity: 0.55, blur: "mid", color: "vermilion", duration: 37, phase: 0.4, pose: 520 },
    { x: 34, xp: 54.5, scale: 0.55, opacity: 0.6, blur: "mid", color: "amber", duration: 41, phase: 0.86, pose: 380 },
    { x: 66, xp: 56.5, scale: 0.75, opacity: 0.75, color: "honey", duration: 36, phase: 0.52, pose: 590 },
    { x: 22, scale: 0.8, opacity: 0.8, color: "vermilion", duration: 33, phase: 0.08, pose: 450 },
];

// Portrait xp values put the columns at the viewport edges (the wordmark spans most of a phone's width).
const NEAR: readonly LanternConfig[] = [
    { x: 28, xp: 31, scale: 1.15, opacity: 1, color: "amber", duration: 23, phase: 0.36, pose: 800, sway: 6.1, flicker: 3.7 },
    { x: 76, xp: 57.5, scale: 1.35, opacity: 1, color: "vermilion", duration: 19, phase: 0.7, pose: 238, sway: 5.3, flicker: 4.3 },
    { x: 91, scale: 0.95, opacity: 1, color: "honey", duration: 21, phase: 0.08, pose: 520, sway: 5.7, flicker: 3.9 },
];

export function LoadingLanterns({ plane }: { plane: "far" | "near" }) {
    const near = plane === "near";
    return (
        <div className={`ls-lanterns ls-par ${near ? "ls-par-near" : "ls-par-far"}`}>
            {(near ? NEAR : FAR).map((l) => {
                const classes = ["ls-lan", l.optional && "ls-lan-opt", l.xp === undefined && "ls-p-hide"].filter(Boolean).join(" ");
                return (
                    <div
                        key={l.x}
                        className={classes}
                        style={cssVars({
                            "--x": `${l.x}%`,
                            ...(l.xp !== undefined ? { "--xp": `${l.xp}%` } : {}),
                            "--y0": near ? 1180 : 760,
                            "--dx": near ? 90 : l.scale > 0.6 ? 50 : 30,
                            "--dur": `${l.duration}s`,
                            "--delay": `${-(l.phase * l.duration).toFixed(2)}s`,
                            "--pose": l.pose,
                        })}
                    >
                        <div className="ls-lan-depth" style={cssVars({ "--s": l.scale, "--o": l.opacity })}>
                            {near && <div className="ls-lan-glow" style={cssVars({ "--fl": `${l.flicker}s` })} />}
                            <svg
                                className={near ? "ls-lan-sway" : undefined}
                                viewBox="-60 -60 120 150"
                                style={near ? cssVars({ "--swd": `${l.sway}s` }) : undefined}
                            >
                                {!near && <use href="#lan-glow" />}
                                <use href={`#lan-${l.color}`} filter={l.blur ? `url(#ls-blur-${l.blur})` : undefined} />
                            </svg>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
