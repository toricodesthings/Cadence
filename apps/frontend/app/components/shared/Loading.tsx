import { LoadingDefs } from "./loading/LoadingDefs";
import { LoadingSky, LoadingSkyMotion } from "./loading/LoadingSky";
import { LoadingMountains } from "./loading/LoadingMountains";
import { LoadingCityscape } from "./loading/LoadingCityscape";
import { LoadingWater } from "./loading/LoadingWater";
import { LoadingLanterns } from "./loading/LoadingLanterns";
import { LoadingParticles } from "./loading/LoadingParticles";
import { LoadingFrame } from "./loading/LoadingFrame";
import { LoadingForeground } from "./loading/LoadingForeground";
import "./loading/loading-tokens.css";
import "./loading/loading-scene.css";
import { memo, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * One scene for the whole boot. The pre-rendered fallback, the session check and "Preparing your
 * workspace" each render <Loading>, and remounting the scene between them replayed its entrance,
 * threw every loop back to frame one and re-rasterised the whole landscape. So <Loading> only
 * registers; <LoadingHost> (in the root Layout, which outlives hydration) draws the single scene,
 * and the newest titled request names it. A request's children portal into the scene.
 */
type Request = { title?: string; progress?: number; since: number };
type Snapshot = {
    owner: Request | null;
    title?: string;
    progress?: number;
    slot: HTMLElement | null;
    leaving: boolean;
};

// A titled bar on screen at least this long (past the title swap) fills to the end before leaving.
const READ_MS = 400;
const TITLE_MS = 1000;

/** The arrival flight: the scene drifts into the valley and dissolves while the app is live underneath. */
// Reduced motion zeroes --ls-fly-k in loading-scene.css (the in-app setting, or the OS one unless "full").
export const flyMs = () => {
    const screen = document.querySelector(".loading-screen");
    return screen && getComputedStyle(screen).getPropertyValue("--ls-fly-k").trim() === "0" ? 200 : 600;
};
// A critically damped spring from rest (x = 1 − (1 + ωt)e^(−ωt), ω = 6), normalised to end at 1.
const FLY_EASE = (() => {
    const x = (t: number) => 1 - (1 + 6 * t) * Math.exp(-6 * t);
    const samples = Array.from({ length: 24 }, (_, i) => (x(i / 23) / x(1)).toFixed(4));
    return `linear(${samples.join(", ")})`;
})();
const FLY_FALLBACK = "cubic-bezier(0.3, 0, 0.15, 1)";

let requests: Request[] = [];
let slot: HTMLElement | null = null;
let snapshot: Snapshot = { owner: null, slot: null, leaving: false };
// The pre-rendered page is the fallback's scene, so hydration starts with one showing.
const SERVER_SNAPSHOT: Snapshot = { owner: { since: 0 }, slot: null, leaving: false };
const listeners = new Set<() => void>();
let cancelRelease = () => {};

function publish(last?: Request) {
    const owner = requests.filter((r) => r.title !== undefined).at(-1) ?? requests.at(-1) ?? last ?? null;
    const progress = owner === last && owner?.progress !== undefined ? 1 : owner?.progress;
    const leaving = !requests.length && owner !== null;
    if (
        owner === snapshot.owner &&
        leaving === snapshot.leaving &&
        owner?.title === snapshot.title &&
        progress === snapshot.progress &&
        slot === snapshot.slot
    )
        return;
    snapshot = { owner, title: owner?.title, progress, slot, leaving };
    listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;
const setSlot = (el: HTMLElement | null) => {
    slot = el;
    publish();
};

// The last request let go: the bar fills (if it has one) as the flight starts, and the scene unmounts after it.
function leave(last: Request) {
    publish(last);
    const timer = setTimeout(() => publish(), flyMs());
    cancelRelease = () => clearTimeout(timer);
}

function request(entry: Request) {
    requests = [...requests, entry];
    cancelRelease();
    publish();
    return () => {
        requests = requests.filter((r) => r !== entry);
        if (requests.length) return publish();
        if (entry.progress !== undefined && performance.now() - entry.since > READ_MS) {
            leave(entry);
            return;
        }
        // Hand-offs land in the same commit; a frame's grace covers one that doesn't, so the scene never blinks out.
        const frame = requestAnimationFrame(() => leave(entry));
        cancelRelease = () => cancelAnimationFrame(frame);
    };
}

/**
 * Shows the loading scene while mounted; `children` render under the wordmark. `progress` (0–1, the
 * share of known work done) turns the title into a bar: 10–90% while working, full as it leaves.
 */
export function Loading({ title, progress, children }: { title?: string; progress?: number; children?: ReactNode }) {
    const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const entry = useRef<Request>({ since: performance.now() }).current;
    // Before the request below, so a new request arrives with its progress.
    useLayoutEffect(() => {
        entry.progress = progress === undefined ? undefined : 0.1 + 0.8 * Math.min(Math.max(progress, 0), 1);
        publish();
    }, [entry, progress]);
    // A fast start never names itself: the title (and its bar) waits TITLE_MS, so a quick load goes
    // straight from the wordmark to the flight instead of swapping text on the way out.
    useLayoutEffect(() => {
        const wait = TITLE_MS - (performance.now() - entry.since);
        entry.title = wait > 0 ? undefined : title;
        const release = request(entry);
        if (wait <= 0 || title === undefined) return release;
        const timer = setTimeout(() => {
            entry.title = title;
            publish();
        }, wait);
        return () => {
            clearTimeout(timer);
            release();
        };
    }, [entry, title]);
    return children && current.slot && current.owner === entry ? createPortal(children, current.slot) : null;
}

/** The one place the scene is drawn. Lives in the root Layout so it survives hydration. */
export function LoadingHost() {
    const { owner, title, progress, leaving } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return owner ? <LoadingScene title={title} progress={progress} leaving={leaving} /> : null;
}

/**
 * Loading scene — a lantern-lit autumn valley on a moon-viewing night.
 *
 * Markup is identical for every season and mode. The head boot script stamps
 * `data-loading-season`, `data-loading-mode` and `data-motion` on `<html>`, and
 * the tokens and visibility gates in `loading-tokens.css` do the rest. This keeps
 * the pre-rendered `HydrateFallback` correct before JS and hydration-safe.
 */
function LoadingScene({ title, progress, leaving }: { title?: string; progress?: number; leaving: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const fly = useRef<Animation | null>(null);
    // One driver (--ls-fly, 0 → 1) moves every layer. A request mid-flight reverses it from where it is.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (fly.current) {
            const forward = fly.current.playbackRate > 0;
            if (leaving !== forward) fly.current.reverse();
            return;
        }
        if (!leaving) return;
        const run = (easing: string) =>
            el.animate({ "--ls-fly": [0, 1] } as PropertyIndexedKeyframes, { duration: flyMs(), easing, fill: "both" });
        try {
            fly.current = run(FLY_EASE);
        } catch {
            fly.current = run(FLY_FALLBACK);
        }
    }, [leaving]);
    return (
        <div
            ref={ref}
            data-leaving={leaving || undefined}
            inert={leaving || undefined}
            aria-hidden={leaving || undefined}
            className="loading-screen layer-loading-screen fixed inset-0 flex items-center justify-center overflow-hidden"
        >
            <LoadingBackdrop />
            <LoadingForeground title={title} progress={progress} slotRef={setSlot} />
        </div>
    );
}

/** The landscape never changes with the title or the bar, so their updates skip it. */
const LoadingBackdrop = memo(function LoadingBackdrop() {
    return (
        <>
            <div className="loading-stage" aria-hidden="true">
                <svg className="ls-layer" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
                    <LoadingDefs />
                    <LoadingSky />
                </svg>
                <LoadingSkyMotion />
                <LoadingMountains />
                <LoadingLanterns plane="far" />
                <LoadingCityscape />
                <LoadingWater />
                <LoadingLanterns plane="near" />
            </div>
            <LoadingParticles />
            {/* Scaled about the viewport centre, so the boughs leave toward their own corners. */}
            <div className="ls-fly-frame" aria-hidden="true">
                <LoadingFrame />
            </div>
            <div className="ls-vignette" aria-hidden="true" />
        </>
    );
});
