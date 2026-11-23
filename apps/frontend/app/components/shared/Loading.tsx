import { LoadingDefs } from "./loading/LoadingDefs";
import { LoadingSky, LoadingSkyMotion } from "./loading/LoadingSky";
import { LoadingMountains } from "./loading/LoadingMountains";
import { LoadingCityscape } from "./loading/LoadingCityscape";
import { LoadingWater } from "./loading/LoadingWater";
import { LoadingLanterns } from "./loading/LoadingLanterns";
import { LoadingParticles } from "./loading/LoadingParticles";
import { LoadingFrame } from "./loading/LoadingFrame";
import { LoadingForeground } from "./loading/LoadingForeground";
import { startFlight } from "./loading/flight";
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

let requests: Request[] = [];
let slot: HTMLElement | null = null;
let snapshot: Snapshot = { owner: null, slot: null, leaving: false };
// The pre-rendered page is the fallback's scene, so hydration starts with one showing.
const SERVER_SNAPSHOT: Snapshot = { owner: { since: 0 }, slot: null, leaving: false };
const listeners = new Set<() => void>();
let cancelRelease = () => {};
// When the scene on screen appeared: a pre-rendered one is up from the page's start; -1 while none is.
let sceneSince = typeof document !== "undefined" && document.querySelector(".loading-screen") ? 0 : -1;

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

// The last request let go: the bar fills (if it has one) as the flight starts.
const leave = (last: Request) => publish(last);
// The flight finished: the scene unmounts, unless loading resumed meanwhile. Keyed to the animations, not a
// timer: they start on the first frame painted after the busy reveal, and a timer set beforehand could fire
// in that same frame and drop the scene before any of the flight was seen.
const flown = () => {
    if (requests.length) return;
    sceneSince = -1;
    publish();
};

function request(entry: Request) {
    if (sceneSince < 0) sceneSince = performance.now();
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
    // A fast start never names itself: no title (or bar) until the scene has been up TITLE_MS, so a quick load
    // goes straight from the wordmark to the flight. Timed from the scene, not this step, so a late step that
    // inherits a long-running scene names itself at once instead of just before the flight.
    useLayoutEffect(() => {
        entry.title = undefined;
        const release = request(entry);
        if (title === undefined) return release;
        const show = () => {
            entry.title = title;
            publish();
        };
        const wait = TITLE_MS - (performance.now() - sceneSince);
        if (wait <= 0) {
            show();
            return release;
        }
        const timer = setTimeout(show, wait);
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
    const fly = useRef<Animation[]>([]);
    // The flight (loading/flight.ts). A request mid-flight reverses every layer from where it is.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (fly.current.length) {
            const forward = fly.current[0].playbackRate > 0;
            if (leaving !== forward) fly.current.forEach((anim) => anim.reverse());
        } else if (leaving) fly.current = startFlight(el);
        if (leaving) Promise.all(fly.current.map((anim) => anim.finished)).then(flown, () => undefined);
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
