const FILES = import.meta.glob<string>("../assets/clips/*", { eager: true, query: "?url", import: "default" });
const file = (name: string) => FILES[`../assets/clips/${name}`];

export type ClipName = "capture" | "plan" | "schedule" | "assistant" | "routines" | "reset";

export const clip = (name: ClipName) => ({
    av1: file(`${name}.av1.mp4`),
    h264: file(`${name}.h264.mp4`),
    poster: file(`${name}-poster.webp`),
});

const AV1 = 'video/mp4; codecs="av01.0.08M.10"';
let codec: Promise<"av1" | "h264"> | undefined;
const pickCodec = () =>
    (codec ??= (
        navigator.mediaCapabilities
            ? navigator.mediaCapabilities
                  .decodingInfo({
                      type: "file",
                      video: { contentType: AV1, width: 1120, height: 840, bitrate: 1_500_000, framerate: 60 },
                  })
                  .then((r) => (r.supported && r.smooth && r.powerEfficient ? ("av1" as const) : ("h264" as const)))
            : Promise.resolve("h264" as const)
    ).catch(() => "h264" as const));

const still = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

const visible = new WeakSet<HTMLVideoElement>();
const started = new WeakSet<HTMLVideoElement>();

const sync = (video: HTMLVideoElement) => {
    if (!video.src) return;
    if (visible.has(video)) video.play().catch(() => {});
    else video.pause();
};

export function tendClip(video: HTMLVideoElement, near: boolean, seen: boolean) {
    if (seen) visible.add(video);
    else visible.delete(video);
    if (near && !started.has(video)) {
        started.add(video);
        if (still()) return;
        void pickCodec()
            .then((c) => fetch(video.dataset[c]!))
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
            .then((blob) => {
                video.muted = true;
                video.src = URL.createObjectURL(blob);
                sync(video);
            })
            .catch(() => {});
        return;
    }
    sync(video);
}
