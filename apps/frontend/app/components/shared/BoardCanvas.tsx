import { useEffect, useState } from "react";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useDragScroll } from "../../hooks/ui/use-drag-scroll";

export interface BoardColumn {
    id: string;
    title: string;
    count: number;
    description?: React.ReactNode;
    headerAction?: React.ReactNode;
    content: React.ReactNode;
    footer?: React.ReactNode;
}

interface BoardCanvasProps {
    columns: BoardColumn[];
    mobileMode?: "single" | "pager";
    emptyState?: React.ReactNode;
    className?: string;
}

export function BoardColumnShell({
    title,
    count,
    description,
    headerAction,
    content,
    footer,
}: BoardColumn) {
    return (
        <section className="flex min-h-full flex-col rounded-[28px] border border-twilight-border/45 bg-twilight-surface/20 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-twilight-border/30 px-5 py-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-display text-base font-semibold text-twilight-text">{title}</h3>
                        <span className="rounded-full border border-twilight-border/40 bg-white/[0.03] px-2.5 py-0.5 text-[11px] tabular-nums text-twilight-text-soft">
                            {count}
                        </span>
                    </div>
                    {description ? (
                        <div className="mt-1 text-sm leading-relaxed text-twilight-text-soft">
                            {description}
                        </div>
                    ) : null}
                </div>
                {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
            </div>

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
}: BoardCanvasProps) {
    const shell = useShellMode();
    const dragScroll = useDragScroll();
    const [activeColumnId, setActiveColumnId] = useState(columns[0]?.id ?? "");

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
            <div className={["flex min-h-0 flex-1 flex-col gap-3", className].join(" ").trim()}>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hidden">
                    {columns.map((column) => (
                        <button
                            key={column.id}
                            type="button"
                            onClick={() => setActiveColumnId(column.id)}
                            className={`touch-target inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-colors ${
                                activeColumn.id === column.id
                                    ? "border-lantern/30 bg-lantern/14 text-lantern"
                                    : "border-twilight-border/45 bg-white/[0.03] text-twilight-text-soft"
                            }`}
                        >
                            <span>{column.title}</span>
                            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] tabular-nums">
                                {column.count}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="min-h-0 flex-1">
                    <BoardColumnShell {...activeColumn} />
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
                className="h-full min-h-0 flex-1 overflow-x-auto overflow-y-auto px-4 pb-4 pt-4 scrollbar-thin cursor-grab sm:px-6 lg:px-8"
            >
                <div
                    className={`flex min-h-full items-stretch gap-4 ${mobileMode === "pager" ? "snap-x snap-mandatory" : ""}`}
                >
                    {columns.map((column) => (
                        <div
                            key={column.id}
                            className={`w-[min(24rem,78vw)] shrink-0 ${mobileMode === "pager" ? "snap-start" : ""}`}
                        >
                            <BoardColumnShell {...column} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
