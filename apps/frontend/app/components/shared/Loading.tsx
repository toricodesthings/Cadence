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

type Request = { title?: string; progress?: number; since: number };
type Snapshot = {
    owner: Request | null;
    title?: string;
    progress?: number;
    slot: HTMLElement | null;
    leaving: boolean;
};

const READ_MS = 400;
const TITLE_MS = 1000;

let requests: Request[] = [];
let slot: HTMLElement | null = null;
let snapshot: Snapshot = { owner: null, slot: null, leaving: false };
const SERVER_SNAPSHOT: Snapshot = { owner: { since: 0 }, slot: null, leaving: false };
const listeners = new Set<() => void>();
let cancelRelease = () => {};
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

const leave = (last: Request) => publish(last);
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
        const frame = requestAnimationFrame(() => leave(entry));
        cancelRelease = () => cancelAnimationFrame(frame);
    };
}

export function Loading({ title, progress, children }: { title?: string; progress?: number; children?: ReactNode }) {
    const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const entry = useRef<Request>({ since: performance.now() }).current;
    useLayoutEffect(() => {
        entry.progress = progress === undefined ? undefined : 0.1 + 0.8 * Math.min(Math.max(progress, 0), 1);
        publish();
    }, [entry, progress]);
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

export function LoadingHost() {
    const { owner, title, progress, leaving } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return owner ? <LoadingScene title={title} progress={progress} leaving={leaving} /> : null;
}

function LoadingScene({ title, progress, leaving }: { title?: string; progress?: number; leaving: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const fly = useRef<Animation[]>([]);
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
            <div className="ls-fly-frame" aria-hidden="true">
                <LoadingFrame />
            </div>
            <div className="ls-vignette" aria-hidden="true" />
        </>
    );
});
