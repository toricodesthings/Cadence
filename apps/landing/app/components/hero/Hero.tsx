import { useEffect, useRef } from "react";

import { cssVars } from "~/lib/geometry";
import { INTRO_KEY, onIntroStart, releaseIntro, startIntro } from "~/lib/intro";
import { watchViewport } from "~/lib/viewport";

import { HeroBough } from "./HeroBough";
import { HeroLandscape } from "./HeroLandscape";
import { HeroSky } from "./HeroSky";
import { HeroWordmark } from "./HeroWordmark";

/*
 * The Twilight Bough. The intro is pure CSS and plays from the SSR HTML; the
 * only JS settles it early (any input) and drives the desktop pointer
 * parallax. Once settled, the tab remembers it: a refresh starts in the short
 * return entrance instead (flagged before first paint, see lib/intro.ts).
 */

const INTRO_MS = 2900;
const PARALLAX_AT = 2600;

/** Six motes rising from near the bough tips toward the wordmark: [x %, y %, size px, dx px, dur s]. */
const SPARKS: readonly (readonly [number, number, number, number, number])[] = [
  [16, 64, 6, 40, 11],
  [24, 74, 4, 56, 14],
  [31, 58, 8, 30, 9.5],
  [70, 60, 7, -34, 12],
  [78, 72, 5, -50, 15],
  [86, 54, 9, -26, 10.5],
];

export function Hero() {
  const ref = useRef<HTMLElement>(null);

  /*
   * The intro waits at its first frame until the page is ready (lib/intro.ts), so its clock starts
   * here rather than at first paint. Settle: any input jumps it to its end frame, and the tab
   * remembers it (the intro plays once per tab session).
   */
  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;
    let settled = false;
    let done = 0;
    const settle = () => {
      if (settled) return;
      settled = true;
      hero.classList.add("is-settled");
      try {
        sessionStorage.setItem(INTRO_KEY, "1");
      } catch {
        // Storage blocked: the intro simply plays again next time.
      }
    };
    if (document.documentElement.hasAttribute("data-hero-return")) settle();
    const cancelRelease = releaseIntro();
    const events = ["scroll", "pointerdown", "keydown", "touchstart"] as const;
    const onInput = () => {
      settle();
      startIntro();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onInput();
    };
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const cancelStart = onIntroStart(() => {
      done = window.setTimeout(settle, INTRO_MS);
    });
    return () => {
      cancelRelease();
      cancelStart();
      events.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(done);
    };
  }, []);

  // Pause every hero animation while it is scrolled out of view; resume when it returns (no IntersectionObserver: lib/viewport.ts).
  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;
    return watchViewport([hero], (el, _share, near) => el.classList.toggle("is-offscreen", !near));
  }, []);

  /*
   * Pointer parallax (fine pointers, desktop widths, motion allowed). Each layer
   * marked `data-depth` gets its own `translate`, written straight onto that
   * element: a custom property on the hero would restyle every SVG node inside
   * it on each frame. The layers are promoted in hero.css, so a move is
   * composite-only.
   */
  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;
    const mq = window.matchMedia(
      "(pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)",
    );
    if (!mq.matches) return;
    const layers = Array.from(hero.querySelectorAll<HTMLElement>("[data-depth]"), (el) => ({
      el,
      depth: Number(el.dataset.depth),
      xOnly: el.dataset.axis === "x",
    }));
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let last = 0;
    let enabled = false;
    const tick = (now: number) => {
      // Eased per 60 Hz frame, scaled by elapsed time so it glides the same at any refresh rate.
      const k = 1 - Math.pow(0.92, last ? Math.min(4, (now - last) / 16.667) : 1);
      last = now;
      x += (tx - x) * k;
      y += (ty - y) * k;
      for (const { el, depth, xOnly } of layers) {
        el.style.translate = `${(x * depth).toFixed(2)}px ${xOnly ? 0 : (y * depth).toFixed(2)}px`;
      }
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.002) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        last = 0;
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    // Viewport-relative: the effect only runs while the hero fills the screen, and it avoids a layout read per event.
    const onMove = (e: PointerEvent) => {
      if (!enabled) return;
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      kick();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    let start = 0;
    const cancelStart = onIntroStart(() => {
      start = window.setTimeout(
        () => (enabled = true),
        hero.classList.contains("is-settled") ? 0 : PARALLAX_AT,
      );
    });
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);
    return () => {
      cancelStart();
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section ref={ref} className="hero" aria-labelledby="hero-title">
      <HeroSky />
      <HeroLandscape />
      <div className="hero-boughs" aria-hidden="true">
        <HeroBough name="l" className="hero-bough-l" depth={10} />
        <HeroBough name="r" className="hero-bough-r" depth={10} />
        <HeroBough name="s" className="hero-bough-s" depth={7} />
        <HeroBough name="pl" className="hero-bough-pl" />
        <HeroBough name="pr" className="hero-bough-pr" />
      </div>
      <div className="hero-flare hero-rm-hide" aria-hidden="true" />
      <div className="hero-layer hero-sparks hero-rm-hide" aria-hidden="true">
        {SPARKS.map(([x, y, size, dx, dur], i) => (
          <span
            key={i}
            className="hero-spark"
            style={cssVars({
              "--x": `${x}%`,
              "--y": `${y}%`,
              "--size": `${size}px`,
              "--dx": `${dx}px`,
              "--o": 0.35 + (size - 4) * 0.05,
              "--dur": `${dur}s`,
              "--delay": `${-(i * 1.9)}s`,
            })}
          />
        ))}
      </div>
      <div className="hero-layer hero-vignette" aria-hidden="true" />
      {/* Night falls over the scene as the moon sets (hero.css); under the words, which stay crisp */}
      <div className="hero-dim" aria-hidden="true" />
      <HeroWordmark />
      <span className="hero-cue" aria-hidden="true" />
    </section>
  );
}
