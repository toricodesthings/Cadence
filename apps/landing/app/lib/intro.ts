/** sessionStorage key, set once this tab has seen (or skipped) the hero intro. */
export const INTRO_KEY = "cadence-intro";

/** On <html> while the hero's timelines wait at their first frame (hero.css). */
const HOLD = "data-hero-hold";

/** The hold lifts on its own after this long, so a page whose script never arrives still plays. */
const HOLD_MAX_MS = 3000;

/**
 * Inlined in <head> by root.tsx and run before first paint. It holds the hero's
 * intro at its first frame until the page is ready to run it (see
 * `releaseIntro`), so the opening is not spent fighting the page load. A return
 * visit also gets `data-hero-return`, so the server-rendered page starts in the
 * short return entrance instead of the full intro and never snaps between them.
 */
export const HEAD_SCRIPT = `try{var d=document.documentElement;d.setAttribute("${HOLD}","");setTimeout(function(){d.removeAttribute("${HOLD}")},${HOLD_MAX_MS});if(sessionStorage.getItem("${INTRO_KEY}"))d.setAttribute("data-hero-return","")}catch(e){}`;

const root = () => document.documentElement;

/** Starts the intro clock now. */
export function startIntro() {
  root().removeAttribute(HOLD);
}

/**
 * Starts the intro clock once the page can give it every frame: after
 * hydration (call from an effect), the fonts, and an idle moment. Returns a
 * cancel.
 */
export function releaseIntro(): () => void {
  let cancelled = false;
  const release = () => {
    if (!cancelled) requestAnimationFrame(startIntro);
  };
  document.fonts.ready.then(() => {
    if (cancelled) return;
    // Safari has no idle callback; a short beat after the fonts stands in for it.
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(release, { timeout: 600 });
    else window.setTimeout(release, 50);
  });
  return () => {
    cancelled = true;
  };
}

/** Calls `fn` once the intro clock is running (at once if it already is). Returns a cancel. */
export function onIntroStart(fn: () => void): () => void {
  if (!root().hasAttribute(HOLD)) {
    fn();
    return () => {};
  }
  const mo = new MutationObserver(() => {
    if (root().hasAttribute(HOLD)) return;
    mo.disconnect();
    fn();
  });
  mo.observe(root(), { attributes: true, attributeFilter: [HOLD] });
  return () => mo.disconnect();
}
