import { clip as clipFiles, type ClipName } from "~/lib/clip";

/**
 * The frame every chapter's panel sits in: lit glass with the buttons' gradient rim and a gem at two corners.
 * Its clip shows the poster until Journey's viewport watcher loads and plays it (lib/clip.ts).
 */
export function Panel({ clip }: { clip: ClipName }) {
  const { av1, h264, poster } = clipFiles(clip);
  return (
    <div className="panel">
      <span className="panel-gem panel-gem-tl" />
      <span className="panel-gem panel-gem-br" />
      <video
        className="panel-clip"
        poster={poster}
        data-av1={av1}
        data-h264={h264}
        muted
        loop
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        preload="none"
        width={560}
        height={420}
      />
    </div>
  );
}
