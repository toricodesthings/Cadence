/**
 * Reports which of a few large elements (the hero, the journey's sections) are on screen, without an
 * IntersectionObserver: in Chrome a live IntersectionObserver turns every running composited transform animation
 * on the page (the wind, sparks, rings, petals) into a main-thread frame on every vsync, even while the page sits
 * still. Here bounds are measured up front and again only when something changes size, and a scroll just
 * compares numbers, so between scrolls the main thread stays idle.
 *
 * `onChange(el, share, near)` runs at the start and whenever an element comes near the screen, leaves it, or
 * crosses one of `steps` (`share`: the part of its height inside the viewport, like an IntersectionObserver's
 * ratio). `near` counts `margin` (a share of the viewport's height) around the screen, so work can resume a little
 * before anything of it shows. Returns a cleanup.
 *
 * Every watcher shares one `scroll` listener, one `resize` listener and one ResizeObserver, so a resize measures
 * each target once however many watchers there are.
 */
type Watcher = { measure: () => void; update: () => void; targets: readonly Element[] };

const watchers = new Set<Watcher>();
let ro: ResizeObserver | undefined;

const measureAll = () => watchers.forEach((w) => w.measure());
const updateAll = () => watchers.forEach((w) => w.update());

export function watchViewport(
  targets: readonly Element[],
  onChange: (el: Element, share: number, near: boolean) => void,
  { steps = [], margin = 0 }: { steps?: readonly number[]; margin?: number } = {},
): () => void {
  const bounds = targets.map(() => ({ top: 0, bottom: 0 }));
  const level = targets.map(() => -1);

  const update = () => {
    const top = window.scrollY;
    const bottom = top + window.innerHeight;
    const m = window.innerHeight * margin;
    targets.forEach((el, i) => {
      const b = bounds[i];
      const near = b.bottom > top - m && b.top < bottom + m;
      const seen = Math.max(0, Math.min(bottom, b.bottom) - Math.max(top, b.top));
      const share = b.bottom > b.top ? seen / (b.bottom - b.top) : 0;
      // Levels: far, near but unseen, then seen and each step reached
      const next = !near ? 0 : seen > 0 ? 2 + steps.filter((s) => share >= s).length : 1;
      if (next === level[i]) return;
      level[i] = next;
      onChange(el, share, near);
    });
  };

  const measure = () => {
    targets.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      bounds[i] = { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    });
    update();
  };

  const watcher: Watcher = { measure, update, targets };
  if (!watchers.size) {
    // Anything that moves a section changes the size of the document or of a section
    ro = new ResizeObserver(measureAll);
    ro.observe(document.documentElement);
    window.addEventListener("scroll", updateAll, { passive: true });
    window.addEventListener("resize", measureAll);
  }
  watchers.add(watcher);
  targets.forEach((el) => ro!.observe(el));
  measure();

  return () => {
    watchers.delete(watcher);
    targets.forEach((el) => ro?.unobserve(el));
    if (!watchers.size) {
      ro?.disconnect();
      ro = undefined;
      window.removeEventListener("scroll", updateAll);
      window.removeEventListener("resize", measureAll);
    }
  };
}
