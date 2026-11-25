import { Fragment, useEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { formatChipTime, formatTime } from "../../lib/utils/date-format";
import { useMinuteClock } from "../../hooks/ui/use-realtime-clock";

export interface SpineItem {
    id: string;
    title: string;
    start: Date;
    /** Fixed blocks may have no end. */
    end: Date | null;
}

export type SpineState = "current" | "next" | "upcoming" | "past";

export interface SpineEntry {
    item: SpineItem;
    state: SpineState;
    progress: number | null;
    hasNext: boolean;
    hasGapBefore: boolean;
    hasGapAfter: boolean;
    fillAfter: number;
}

/** Sorted blocks, the one happening now, the next one, and precomputed timeline entries with live connector fill. */
export function useSpine(items: SpineItem[]) {
    const now = useMinuteClock();
    const sorted = useMemo(() => [...items].sort((a, b) => a.start.getTime() - b.start.getTime()), [items]);
    const current = sorted.find((item) => item.start <= now && item.end && item.end > now) ?? null;
    const next = sorted.find((item) => item.start > now) ?? null;
    // A "now" separator only sits in a gap between a finished block and an upcoming one;
    // while a block is active, the block itself anchors now.
    const gapIndex = current ? -1 : sorted.findIndex((item) => item.start > now);
    const entries: SpineEntry[] = sorted.map((item, index) => {
        const state = stateOf(item, now, current, next);
        const nextItem = sorted[index + 1] ?? null;
        return {
            item,
            state,
            progress: state === "current" ? progressOf(item, now) : null,
            hasNext: nextItem !== null,
            hasGapBefore: index === gapIndex && gapIndex > 0,
            hasGapAfter: nextItem !== null && gapIndex === index + 1,
            fillAfter: nextItem ? segmentFillOf(item, nextItem, now) : 0,
        };
    });
    const hasCompleted = entries.some((entry) => entry.state === "past");
    const anchorId = (current ?? next)?.id ?? null;
    return { now, sorted, current, next, gapIndex, entries, hasCompleted, anchorId };
}

function stateOf(item: SpineItem, now: Date, current: SpineItem | null, next: SpineItem | null): SpineState {
    if (item === current) return "current";
    if (!current && item === next) return "next";
    if ((item.end ?? item.start) <= now) return "past";
    return "upcoming";
}

function progressOf(item: SpineItem, now: Date): number | null {
    if (!item.end) return null;
    const total = item.end.getTime() - item.start.getTime();
    if (total <= 0) return null;
    return Math.min(1, Math.max(0, (now.getTime() - item.start.getTime()) / total));
}

/** Fraction (0–1) of the span from `from.start` to `to.start` that has elapsed at `now`. */
function segmentFillOf(from: SpineItem, to: SpineItem, now: Date): number {
    const start = from.start.getTime();
    const end = to.start.getTime();
    if (end <= start) return now.getTime() >= end ? 1 : 0;
    return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

function rangeOf(item: SpineItem): string {
    return formatChipTime(item.start.toISOString(), item.end?.toISOString());
}

/**
 * When earlier blocks are already complete and the timeline overflows, center the current or next-up block
 * in its own scroll container (without scrolling the outer page). Only re-runs when the active/next block changes,
 * so manual scrolling is never fought.
 */
function useAutoCenterAnchor(
    listRef: React.RefObject<HTMLOListElement | null>,
    { axis, anchorId, hasCompleted }: { axis: "x" | "y"; anchorId: string | null; hasCompleted: boolean },
) {
    const prefersReduced = useReducedMotion();
    const lastAnchoredId = useRef<string | null>(null);

    useEffect(() => {
        if (!anchorId || !hasCompleted || lastAnchoredId.current === anchorId) return;

        const list = listRef.current;
        const scroller = axis === "x" ? list : list?.parentElement;
        const target = list?.querySelector<HTMLElement>('[data-spine-anchor="true"]');
        if (!scroller || !target) return;

        const maxScroll =
            axis === "x" ? scroller.scrollWidth - scroller.clientWidth : scroller.scrollHeight - scroller.clientHeight;
        if (maxScroll <= 0) return;

        const isInitial = lastAnchoredId.current === null;
        lastAnchoredId.current = anchorId;

        const scrollerRect = scroller.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const raw =
            axis === "x"
                ? targetRect.left -
                  scrollerRect.left +
                  scroller.scrollLeft +
                  targetRect.width / 2 -
                  scroller.clientWidth / 2
                : targetRect.top -
                  scrollerRect.top +
                  scroller.scrollTop +
                  targetRect.height / 2 -
                  scroller.clientHeight / 2;
        const clamped = Math.max(0, Math.min(maxScroll, raw));

        const setting = document.documentElement.dataset.motion;
        const reduced = setting === "reduced" || (setting !== "full" && Boolean(prefersReduced));
        const behavior: ScrollBehavior = isInitial || reduced ? "auto" : "smooth";

        if (typeof scroller.scrollTo === "function") {
            scroller.scrollTo(axis === "x" ? { left: clamped, behavior } : { top: clamped, behavior });
        } else if (axis === "x") {
            scroller.scrollLeft = clamped;
        } else {
            scroller.scrollTop = clamped;
        }
    }, [listRef, axis, anchorId, hasCompleted, prefersReduced]);
}

/** Fallback for browsers without scroll-driven animation timelines: marks scrollable edges for `.spine-scroll`. */
function useScrollFadeFallback(ref: React.RefObject<HTMLOListElement | null>, count: number) {
    useEffect(() => {
        const scroller = ref.current;
        if (!scroller || count < 2) return;
        if (
            typeof CSS !== "undefined" &&
            typeof CSS.supports === "function" &&
            CSS.supports("animation-timeline", "scroll()")
        ) {
            return;
        }
        if (typeof IntersectionObserver === "undefined") return;
        const first = scroller.firstElementChild;
        const last = scroller.lastElementChild;
        if (!first || !last) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const { target, intersectionRatio } of entries) {
                    if (target === first) scroller.classList.toggle("more-start", intersectionRatio < 1);
                    if (target === last) scroller.classList.toggle("more-end", intersectionRatio < 1);
                }
            },
            { root: scroller, threshold: 1, rootMargin: "1px" },
        );
        observer.observe(first);
        observer.observe(last);
        return () => {
            observer.disconnect();
            scroller.classList.remove("more-start", "more-end");
        };
    }, [ref, count]);
}

function SpineBlockCard({
    item,
    state,
    progress,
    surface,
    onOpen,
}: {
    item: SpineItem;
    state: SpineState;
    progress: number | null;
    surface: "list" | "board";
    onOpen: (item: SpineItem) => void;
}) {
    const timeRange = rangeOf(item);
    const isAnchor = state === "current" || state === "next";
    const statusSuffix =
        state === "current" ? ", happening now" : state === "next" ? ", up next" : state === "past" ? ", passed" : "";

    const surfaceClass =
        surface === "list"
            ? isAnchor
                ? "surface-card rounded-[18px]"
                : "surface-row rounded-[18px] border border-twilight-border/70"
            : isAnchor
              ? "surface-item rounded-[16px] border"
              : "surface-row rounded-[16px] border border-twilight-border/60";

    const stateClass =
        state === "current"
            ? "spine-block-current"
            : state === "next"
              ? "spine-block-next"
              : state === "past"
                ? "border-twilight-border/40 opacity-60 hover:opacity-85"
                : "";

    return (
        <button
            type="button"
            onClick={() => onOpen(item)}
            aria-current={state === "current" ? "time" : undefined}
            aria-label={`${item.title}, ${timeRange}${statusSuffix}`}
            className={`press relative flex min-h-11 w-full cursor-pointer flex-col justify-center overflow-hidden text-left transition-[background-color,border-color,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                isAnchor ? "py-3.5 pl-5 pr-4" : "px-4 py-3.5"
            } ${surfaceClass} ${stateClass}`}
        >
            {isAnchor ? (
                <span
                    aria-hidden="true"
                    className={`spine-anchor-bar absolute inset-y-3 left-2 w-[3px] rounded-full ${
                        state === "current" ? "bg-accent-primary" : "bg-moonlit/80"
                    }`}
                />
            ) : null}

            <div className="flex items-center justify-between gap-3">
                {state === "current" ? (
                    <>
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] leading-none text-accent-primary">
                            {surface === "list" ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" aria-hidden="true" />
                            ) : null}
                            Now
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums leading-none text-twilight-text-soft">
                            {timeRange}
                        </span>
                    </>
                ) : state === "next" ? (
                    <>
                        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] leading-none text-moonlit">
                            Next
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums leading-none text-twilight-text-soft">
                            {timeRange}
                        </span>
                    </>
                ) : (
                    <span
                        className={`text-[12px] tabular-nums leading-none ${
                            state === "past" ? "text-twilight-text-muted/90" : "text-twilight-text-soft"
                        }`}
                    >
                        {timeRange}
                    </span>
                )}
            </div>

            <span
                className={`mt-1.5 block truncate text-[15px] leading-snug tracking-[-0.01em] ${
                    state === "past" ? "font-normal text-twilight-text-soft" : "font-medium text-twilight-text"
                }`}
            >
                {item.title}
            </span>

            {state === "current" && progress !== null ? (
                <span
                    aria-hidden="true"
                    className="spine-progress-track absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full bg-twilight-border/40"
                >
                    <span
                        className="spine-progress-fill block h-full rounded-full bg-accent-primary/80 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </span>
            ) : null}
        </button>
    );
}

/**
 * List view: fixed blocks arranged cleanly in time order inside Today's Fixed section.
 * Anchors the live or next block by surface and accent rail; past blocks recede quietly.
 */
export function DaySpine({ items, onOpen }: { items: SpineItem[]; onOpen: (item: SpineItem) => void }) {
    const { now, entries, hasCompleted, anchorId } = useSpine(items);
    const scrollRef = useRef<HTMLOListElement>(null);
    useScrollFadeFallback(scrollRef, entries.length);
    useAutoCenterAnchor(scrollRef, { axis: "x", anchorId, hasCompleted });

    if (entries.length === 0) return null;

    return (
        <ol
            ref={scrollRef}
            aria-label="Fixed today"
            className="spine-scroll scrollbar-thin flex items-stretch overflow-x-auto pb-1.5 pt-0.5"
        >
            {entries.map(({ item, state, progress, hasNext, hasGapAfter, fillAfter }) => (
                <Fragment key={item.id}>
                    <li
                        data-spine-anchor={state === "current" || state === "next" ? "true" : undefined}
                        className="flex min-w-[14.5rem] max-w-[19rem] flex-1"
                    >
                        <SpineBlockCard item={item} state={state} progress={progress} surface="list" onOpen={onOpen} />
                    </li>
                    {hasGapAfter ? <NowGap now={now} /> : hasNext ? <HorizontalConnector fill={fillAfter} /> : null}
                </Fragment>
            ))}
        </ol>
    );
}

/** List view, folded: one quiet peek line under the Fixed header showing what's now or next. */
export function SpinePeek({ items, onOpen }: { items: SpineItem[]; onOpen: () => void }) {
    const { current, next } = useSpine(items);
    const anchor = current ?? next;
    const label = current ? "Now" : next ? "Next" : null;
    const time = current
        ? current.end
            ? `until ${formatTime(current.end.toISOString())}`
            : formatTime(current.start.toISOString())
        : next
          ? rangeOf(next)
          : null;

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={
                anchor && label
                    ? `Show ${items.length} fixed. ${label}: ${anchor.title}, ${time}`
                    : `Show ${items.length} fixed. Done for today`
            }
            className="group/peek press press-none -mt-1 ml-8 flex w-[calc(100%-2rem)] min-w-0 cursor-pointer items-center gap-3 rounded-full px-3 py-2 text-left transition-colors hover:bg-panel-raised/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
        >
            {anchor && label ? (
                <>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] leading-none ${
                            current ? "text-accent-primary" : "text-moonlit"
                        }`}
                    >
                        {current ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" aria-hidden="true" />
                        ) : null}
                        {label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-twilight-text-soft transition-colors group-hover/peek:text-twilight-text">
                        {anchor.title}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-twilight-text-muted/90">{time}</span>
                </>
            ) : (
                <span className="text-[13px] text-twilight-text-muted/90">Done for today</span>
            )}
        </button>
    );
}

/** Board view: the same blocks anchored along a continuous vertical spine with live accent fill. */
export function SpineTimeline({ items, onOpen }: { items: SpineItem[]; onOpen: (item: SpineItem) => void }) {
    const { now, entries, hasCompleted, anchorId } = useSpine(items);
    const listRef = useRef<HTMLOListElement>(null);
    useAutoCenterAnchor(listRef, { axis: "y", anchorId, hasCompleted });

    if (entries.length === 0) return null;

    return (
        <ol ref={listRef} aria-label="Fixed today" className="flex flex-col px-1 py-0.5">
            {entries.map(({ item, state, progress, hasNext, hasGapBefore, hasGapAfter, fillAfter }) => {
                const dotClass =
                    state === "current"
                        ? "h-2 w-2 bg-accent-primary ring-4 ring-accent-primary/20"
                        : state === "next"
                          ? "h-2 w-2 bg-moonlit ring-4 ring-moonlit/15"
                          : state === "past"
                            ? "h-1.5 w-1.5 bg-accent-primary/50"
                            : "h-2 w-2 border-[1.5px] border-twilight-border-interactive bg-panel";

                return (
                    <Fragment key={item.id}>
                        {hasGapBefore ? <NowBoardDivider now={now} /> : null}
                        <li
                            data-spine-anchor={state === "current" || state === "next" ? "true" : undefined}
                            className="flex items-stretch gap-3"
                        >
                            <div aria-hidden="true" className="relative flex w-4 shrink-0 flex-col items-center">
                                {hasGapBefore ? (
                                    <span className="absolute top-0 left-1/2 z-0 h-[1.625rem] w-[2px] -translate-x-1/2 bg-twilight-border/55" />
                                ) : null}
                                {hasGapAfter ? (
                                    <span className="spine-line-fill absolute top-[1.625rem] bottom-0 left-1/2 z-0 w-[2px] -translate-x-1/2 bg-accent-primary/50" />
                                ) : hasNext ? (
                                    <VerticalConnector fill={fillAfter} />
                                ) : null}
                                <span className={`relative z-10 mt-[1.375rem] shrink-0 rounded-full ${dotClass}`} />
                            </div>
                            <div className="min-w-0 flex-1 py-1.5">
                                <SpineBlockCard
                                    item={item}
                                    state={state}
                                    progress={progress}
                                    surface="board"
                                    onOpen={onOpen}
                                />
                            </div>
                        </li>
                    </Fragment>
                );
            })}
        </ol>
    );
}

function HorizontalConnector({ fill }: { fill: number }) {
    const percent = Math.round(fill * 100);
    const isLive = fill > 0 && fill < 1;
    return (
        <li aria-hidden="true" className="flex w-7 shrink-0 items-center">
            <span className="relative block h-[2px] w-full rounded-full bg-twilight-border/55">
                {percent > 0 ? (
                    <span
                        data-spine-fill={percent}
                        className={`spine-line-fill block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${
                            isLive ? "spine-line-live bg-accent-primary" : "bg-accent-primary/45"
                        }`}
                        style={{ width: `${percent}%` }}
                    />
                ) : null}
            </span>
        </li>
    );
}

function VerticalConnector({ fill }: { fill: number }) {
    const percent = Math.round(fill * 100);
    const isLive = fill > 0 && fill < 1;
    return (
        <span className="absolute top-[1.625rem] -bottom-[1.625rem] left-1/2 z-0 w-[2px] -translate-x-1/2 rounded-full bg-twilight-border/55">
            {percent > 0 ? (
                <span
                    data-spine-fill={percent}
                    className={`spine-line-fill block w-full rounded-full transition-[height] duration-500 ease-out motion-reduce:transition-none ${
                        isLive ? "spine-line-live bg-accent-primary" : "bg-accent-primary/45"
                    }`}
                    style={{ height: `${percent}%` }}
                />
            ) : null}
        </span>
    );
}

function NowGap({ now }: { now: Date }) {
    const time = formatTime(now.toISOString());
    return (
        <li className="flex shrink-0 items-center">
            <div
                role="separator"
                aria-label={`Now, ${time}`}
                className="grid min-w-[4.75rem] grid-rows-[1fr_auto_1fr] items-center"
            >
                <span aria-hidden="true" />
                <div className="flex items-center" aria-hidden="true">
                    <span className="spine-line-fill spine-line-live h-[2px] flex-1 rounded-l-full bg-accent-primary/80" />
                    <span className="h-2 w-2 shrink-0 rounded-full bg-accent-primary ring-4 ring-accent-primary/20" />
                    <span className="h-[2px] flex-1 rounded-r-full bg-twilight-border/55" />
                </div>
                <span
                    aria-hidden="true"
                    className="whitespace-nowrap px-2.5 pt-2 text-center text-[11px] font-medium tabular-nums leading-none text-accent-primary"
                >
                    {time}
                </span>
            </div>
        </li>
    );
}

function NowBoardDivider({ now }: { now: Date }) {
    const time = formatTime(now.toISOString());
    return (
        <li className="flex items-stretch">
            <div role="separator" aria-label={`Now, ${time}`} className="flex flex-1 items-stretch gap-3">
                <div aria-hidden="true" className="flex w-4 shrink-0 flex-col items-center">
                    <span className="spine-line-fill w-[2px] flex-1 bg-accent-primary/50" />
                    <span className="relative z-10 h-2 w-2 shrink-0 rounded-full bg-accent-primary ring-4 ring-accent-primary/20" />
                    <span className="w-[2px] flex-1 bg-twilight-border/55" />
                </div>
                <div className="flex flex-1 items-center gap-2.5 py-2" aria-hidden="true">
                    <span className="h-px flex-1 bg-accent-primary/40" />
                    <span className="shrink-0 text-[11px] font-medium tabular-nums leading-none text-accent-primary">
                        {time}
                    </span>
                </div>
            </div>
        </li>
    );
}
