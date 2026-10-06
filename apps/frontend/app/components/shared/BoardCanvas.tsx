import { useEffect, useState } from "react";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useDragScroll } from "../../hooks/ui/use-drag-scroll";
import { ChipScroller } from "./ChipScroller";
import { SegmentedControl } from "../primitives/SegmentedControl";
import { Tip } from "../primitives";

export interface BoardColumn {
    id: string;
    title: string;
    count: number;
    icon?: React.ReactNode;
    description?: React.ReactNode;
    headerAction?: React.ReactNode;
    content: React.ReactNode;
    footer?: React.ReactNode;
    collapsed?: boolean;
    /** Collapsed: the whole rail is one button that calls this (shows the column). */
    onExpand?: () => void;
    /** Compact shells: the column chooser already names the column, so the
     * shell drops its own title row instead of repeating it. */
    titleHidden?: boolean;
}

interface BoardCanvasProps {
    columns: BoardColumn[];
    mobileMode?: "single" | "pager";
    emptyState?: React.ReactNode;
    className?: string;
    desktopColumnScroll?: boolean;
    /** Compact shells: control the chosen column from outside. */
    activeColumnId?: string;
    onActiveColumnChange?: (id: string) => void;
    /** Compact shells: control pinned beside the column chooser (it doesn't scroll), e.g. manage sections. */
    compactTrailing?: React.ReactNode;
}

function BoardColumnShell({
    title,
    count,
    icon,
    description,
    headerAction,
    content,
    footer,
    collapsed,
    onExpand,
    titleHidden = false,
}: BoardColumn) {
    if (collapsed) {
        // One button, the whole rail: icon on the open header's line, the count under it.
        return (
            <Tip label={`Show ${title} (${count})`} side="right">
                <button
                    type="button"
                    onClick={onExpand}
                    aria-label={`Show ${title} (${count})`}
                    className="surface-card animate-in fade-in flex h-full min-h-0 w-full cursor-pointer flex-col items-center gap-1.5 rounded-[24px] px-3 pt-4 text-twilight-text-soft transition-colors hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    data-lift
                >
                    <span className="flex h-6 items-center">{icon}</span>
                    <span className="text-[12px] tabular-nums">{count}</span>
                </button>
            </Tip>
        );
    }

    return (
        <section className="surface-card animate-in fade-in flex h-full min-h-0 flex-col rounded-[28px]">
            {!titleHidden || description || headerAction ? (
                <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
                    <div className="min-w-0">
                        {titleHidden ? null : (
                            <div className="flex h-6 items-center gap-2">
                                <h3 className="font-display text-base font-semibold text-twilight-text">{title}</h3>
                                <span className="rounded-full border border-twilight-border/40 bg-white/[0.03] px-2.5 py-0.5 text-[11px] tabular-nums text-twilight-text-soft">
                                    {count}
                                </span>
                            </div>
                        )}
                        {description ? (
                            <div className={`text-sm leading-relaxed text-twilight-text-soft ${titleHidden ? "" : "mt-1"}`}>
                                {description}
                            </div>
                        ) : null}
                    </div>
                    {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
                </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
                {content}
            </div>

            {footer ? (
                <div className="shrink-0 border-t border-twilight-border/30 px-3 py-3">
                    {footer}
                </div>
            ) : null}
        </section>
    );
}

export function BoardCanvas({
    columns,
    mobileMode = "single",
    emptyState = null,
    className = "",
    desktopColumnScroll = false,
    activeColumnId: controlledId,
    onActiveColumnChange,
    compactTrailing,
}: BoardCanvasProps) {
    const shell = useShellMode();
    const dragScroll = useDragScroll();
    const [localId, setLocalId] = useState(columns[0]?.id ?? "");
    const activeColumnId = controlledId ?? localId;
    const setActiveColumnId = (id: string) => { setLocalId(id); onActiveColumnChange?.(id); };

    useEffect(() => {
        if (!columns.length) {
            setActiveColumnId("");
            return;
        }

        if (!columns.some((column) => column.id === activeColumnId)) {
            setActiveColumnId(columns[0].id);
        }
    }, [activeColumnId, columns]);

    if (!columns.length) {
        return emptyState ? <div className={className}>{emptyState}</div> : null;
    }

    if (shell.isCompact) {
        const activeColumn = columns.find((column) => column.id === activeColumnId) ?? columns[0];

        return (
            <div className={["flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-3", className].join(" ").trim()}>
                <div className="flex items-center gap-2">
                <ChipScroller className={`-ml-4 min-w-0 flex-1 pl-4 ${compactTrailing ? "" : "-mr-4 pr-4"}`}>
                    <SegmentedControl
                        ariaLabel="Columns"
                        className="shrink-0"
                        value={activeColumn.id}
                        onChange={setActiveColumnId}
                        options={columns.map((column) => ({
                            value: column.id,
                            label: (
                                <>
                                    {column.title}
                                    <span className="text-[12px] font-normal tabular-nums">{column.count}</span>
                                </>
                            ),
                        }))}
                    />
                </ChipScroller>
                {compactTrailing ? <div className="shrink-0">{compactTrailing}</div> : null}
                </div>

                <div className="min-h-0 flex-1">
                    <BoardColumnShell {...activeColumn} titleHidden />
                </div>
            </div>
        );
    }

    return (
        <div className={["flex h-full min-h-0 flex-col", className].join(" ").trim()}>
            <div
                ref={dragScroll.ref}
                onPointerDown={dragScroll.onPointerDown}
                onPointerMove={dragScroll.onPointerMove}
                onPointerUp={dragScroll.onPointerUp}
                onPointerCancel={dragScroll.onPointerCancel}
                className={`h-full min-h-0 flex-1 overflow-x-auto px-4 pb-4 pt-2 scrollbar-thin cursor-grab sm:px-6 lg:px-8 ${
                    desktopColumnScroll ? "overflow-y-hidden" : "overflow-y-auto"
                }`}
            >
                <div
                    className={`flex items-stretch gap-3 ${desktopColumnScroll ? "h-full min-h-0" : "min-h-full"} ${
                        mobileMode === "pager" ? "snap-x snap-mandatory" : ""
                    }`}
                >
                    {columns.map((column) => (
                        <div
                            key={column.id}
                            className={`${column.collapsed ? "w-[4.75rem]" : "w-[min(clamp(24rem,28vw,30rem),78vw)]"} shrink-0 transition-[width] duration-200 ease-out ${desktopColumnScroll ? "h-full min-h-0" : ""} ${
                                mobileMode === "pager" ? "snap-start" : ""
                            }`}
                        >
                            <BoardColumnShell {...column} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
