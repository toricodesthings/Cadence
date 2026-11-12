/**
 * The chapters' clips (rendered in `videos/`, copied into `assets/clips`). Each is fetched whole, once, and played
 * from a blob: Workers static assets answer a `Range` request with the full file as a 200, which Safari refuses
 * to play as video, and a clip held in memory loops without a seam or a rebuffer. AV1 only where the device
 * decodes it in hardware (MediaCapabilities `powerEfficient`), else H.264. Reduced motion or Save-Data keeps
 * the poster.
 */
const FILES = import.meta.glob<string>("../assets/clips/*", { eager: true, query: "?url", import: "default" });
const file = (name: string) => FILES[`../assets/clips/${name}`];

export type ClipName = "capture" | "plan" | "schedule" | "assistant" | "routines" | "reset";

export const clip = (name: ClipName) => ({
  av1: file(`${name}.av1.mp4`),
  h264: file(`${name}.h264.mp4`),
  poster: file(`${name}-poster.webp`),
});

// Main profile, level 4.0, 10-bit: what videos/render.sh encodes
const AV1 = 'video/mp4; codecs="av01.0.08M.10"';
let codec: Promise<"av1" | "h264"> | undefined;
const pickCodec = () =>
  (codec ??= (navigator.mediaCapabilities
    ? navigator.mediaCapabilities
      .decodingInfo({ type: "file", video: { contentType: AV1, width: 1120, height: 840, bitrate: 1_500_000, framerate: 60 } })
      .then((r) => (r.supported && r.smooth && r.powerEfficient ? "av1" as const : "h264" as const))
    : Promise.resolve("h264" as const)
  ).catch(() => "h264" as const));

const still = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches
  || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

const visible = new WeakSet<HTMLVideoElement>();
const started = new WeakSet<HTMLVideoElement>();

const sync = (video: HTMLVideoElement) => {
  if (!video.src) return;
  if (visible.has(video)) video.play().catch(() => {});
  else video.pause();
};

/** From the viewport watcher: `near` starts the download, `seen` plays, leaving the screen pauses. */
export function tendClip(video: HTMLVideoElement, near: boolean, seen: boolean) {
  if (seen) visible.add(video);
  else visible.delete(video);
  if (near && !started.has(video)) {
    started.add(video);
    if (still()) return;
    // ponytail: blobs are never revoked; six clips, ~10 MB at most, for the life of the page
    void pickCodec()
      .then((c) => fetch(video.dataset[c]!))
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        video.muted = true;
        video.src = URL.createObjectURL(blob);
        sync(video);
      })
      .catch(() => {}); // The poster stays
    return;
  }
  sync(video);
}
