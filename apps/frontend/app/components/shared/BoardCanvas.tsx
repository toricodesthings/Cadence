import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import { useColumnSwipe } from "../../hooks/ui/use-column-swipe";
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
    /** Compact shells: control the chosen column from outside. */
    activeColumnId?: string;
    onActiveColumnChange?: (id: string) => void;
    /** Compact shells: control pinned beside the column chooser (it doesn't scroll), e.g. manage sections. */
    compactTrailing?: React.ReactNode;
    /** Wide shells: columns share the width evenly instead of a fixed width each (Capture's few columns). */
    fill?: boolean;
    /** Each open column's icon leads its title (Capture). */
    headerIcons?: boolean;
}

type ColumnHeaderProps = Pick<BoardColumn, "title" | "count" | "description" | "headerAction" | "titleHidden" | "icon"> & { showIcon?: boolean };

function ColumnHeader({ title, count, description, headerAction, titleHidden, icon, showIcon }: ColumnHeaderProps) {
    return (
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
            <div className="min-w-0">
                {titleHidden ? null : (
                    <div className="flex h-6 items-center gap-2">
                        {showIcon && icon}
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
    );
}

function CollapsedRail({ title, count, icon, onExpand }: Pick<BoardColumn, "title" | "count" | "icon" | "onExpand">) {
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
    showIcon,
}: BoardColumn & { showIcon?: boolean }) {
    if (collapsed) return <CollapsedRail title={title} count={count} icon={icon} onExpand={onExpand} />;

    return (
        <section className="surface-card animate-in fade-in flex h-full min-h-0 flex-col rounded-[28px]">
            {!titleHidden || description || headerAction ? (
                <ColumnHeader title={title} count={count} icon={icon} showIcon={showIcon} description={description} headerAction={headerAction} titleHidden={titleHidden} />
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
    activeColumnId: controlledId,
    onActiveColumnChange,
    compactTrailing,
    fill = false,
    headerIcons = false,
}: BoardCanvasProps) {
    const shell = useShellMode();
    const dragScroll = useDragScroll();
    const [localId, setLocalId] = useState(columns[0]?.id ?? "");
    const activeColumnId = controlledId ?? localId;
    const setActiveColumnId = (id: string) => { setLocalId(id); onActiveColumnChange?.(id); };
    // Which way the last change went, so the new column slides in from that side.
    const [enterFrom, setEnterFrom] = useState(0);
    const chooser = useRef<HTMLDivElement>(null);
    const chooseColumn = (id: string) => {
        const from = columns.findIndex((c) => c.id === activeColumnId);
        setEnterFrom(Math.sign(columns.findIndex((c) => c.id === id) - from));
        setActiveColumnId(id);
    };
    const swipe = useColumnSwipe((delta) => {
        const index = columns.findIndex((c) => c.id === activeColumnId) + delta;
        if (index >= 0 && index < columns.length) chooseColumn(columns[index].id);
    });
    // Keep the chosen chip in sight when the chooser overflows (a swipe can land on a hidden one).
    useEffect(() => {
        chooser.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }, [activeColumnId]);

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
                <div ref={chooser} className="flex items-center gap-2">
                <ChipScroller className={`-ml-4 min-w-0 flex-1 pl-4 ${compactTrailing ? "" : "-mr-4 pr-4"}`}>
                    <SegmentedControl
                        ariaLabel="Columns"
                        className="shrink-0"
                        value={activeColumn.id}
                        onChange={chooseColumn}
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

                <div className="min-h-0 flex-1 overflow-hidden" {...swipe}>
                    <motion.div
                        key={activeColumn.id}
                        initial={enterFrom ? { x: enterFrom * 32, opacity: 0 } : false}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                        className="h-full"
                    >
                        <BoardColumnShell {...activeColumn} titleHidden />
                    </motion.div>
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
                className="h-full min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-2 scrollbar-thin cursor-grab sm:px-6 lg:px-8"
            >
                <div
                    className={`flex items-stretch gap-3 h-full min-h-0 ${
                        mobileMode === "pager" ? "snap-x snap-mandatory" : ""
                    }`}
                >
                    {columns.map((column) => (
                        <div
                            key={column.id}
                            className={`${column.collapsed ? "w-[4.75rem] shrink-0" : fill ? "min-w-0 flex-1" : "w-[min(clamp(24rem,28vw,30rem),78vw)] shrink-0"} transition-[width] duration-200 ease-out h-full min-h-0 ${
                                mobileMode === "pager" ? "snap-start" : ""
                            }`}
                        >
                            <BoardColumnShell {...column} showIcon={headerIcons} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
