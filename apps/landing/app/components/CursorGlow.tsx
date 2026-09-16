import { useEffect, useRef } from "react";

import { cssVars } from "~/lib/geometry";

/*
 * A soft light under a fine pointer, trailed by a short comet of embers. The
 * head eases toward the pointer and each ember eases toward the one ahead of
 * it; an ember's opacity follows how far it lags, so the trail shows only in
 * motion and vanishes as the pointer settles. One rAF loop, transform and
 * opacity only, and it stops whenever everything has caught up.
 */

const TRAIL = 14;
const HEAD_EASE = 0.3;
/** Tight follow, so neighbouring embers overlap into one streak instead of a dotted line. */
const TRAIL_EASE = 0.55;
/** Lag (px) at which an ember reaches full strength. */
const FULL_LAG = 28;

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const mq = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!mq.matches) return;

    const [light, ...embers] = Array.from(root.children) as HTMLElement[];
    const pts = Array.from({ length: TRAIL + 1 }, () => ({ x: 0, y: 0 }));
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let last = 0;
    let placed = false;

    const tick = (now: number) => {
      // Eases are tuned per 60 Hz frame; scale them by elapsed time so the trail keeps its length at any refresh rate.
      const frames = last ? Math.min(4, (now - last) / 16.667) : 1;
      last = now;
      const headK = 1 - Math.pow(1 - HEAD_EASE, frames);
      const trailK = 1 - Math.pow(1 - TRAIL_EASE, frames);
      const head = pts[0];
      head.x += (tx - head.x) * headK;
      head.y += (ty - head.y) * headK;
      let moving = Math.abs(tx - head.x) + Math.abs(ty - head.y) > 0.2;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[i - 1];
        p.x += (q.x - p.x) * trailK;
        p.y += (q.y - p.y) * trailK;
        if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) > 0.2) moving = true;
      }
      light.style.transform = `translate3d(${head.x}px, ${head.y}px, 0)`;
      embers.forEach((ember, i) => {
        const p = pts[i + 1];
        const lag = Math.hypot(p.x - head.x, p.y - head.y);
        ember.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        ember.style.opacity = moving ? (Math.min(1, lag / FULL_LAG) * (1 - i / embers.length)).toFixed(3) : "0";
      });
      if (moving) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        last = 0;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      tx = e.clientX;
      ty = e.clientY;
      // First contact (or re-entry): start the whole comet at the pointer instead of streaking in.
      if (!placed) {
        for (const p of pts) {
          p.x = tx;
          p.y = ty;
        }
        placed = true;
      }
      root.classList.add("is-on");
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => {
      root.classList.remove("is-on");
      placed = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="cursor-glow" aria-hidden="true">
      <span className="cursor-glow-light" />
      {Array.from({ length: TRAIL }, (_, i) => (
        <span key={i} className="cursor-glow-ember" style={cssVars({ "--s": 1 - i / TRAIL })} />
      ))}
    </div>
  );
}
