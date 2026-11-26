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
