import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { Tip } from "../primitives/Tooltip";
import * as Popover from "../primitives/Popover";
import * as Dialog from "../primitives/Dialog";

export interface ControlsSheetSection {
    id: string;
    label: string;
    content: React.ReactNode;
    /** Compact shells: "inline" sits in the popover, "drill" opens as a sub-panel. */
    display?: "inline" | "drill";
    /** Current value shown on a drill row, e.g. "Smart order". */
    summary?: React.ReactNode;
}

interface ControlsSheetProps {
    routeKey: string;
    title: string;
    description?: string;
    sections: ControlsSheetSection[];
    triggerLabel?: string;
    triggerClassName?: string;
}

const SECTION_LABEL = "px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted";

export function ControlsSheet({
    routeKey,
    title,
    description,
    sections,
    triggerLabel = "Controls",
    triggerClassName = "",
}: ControlsSheetProps) {
    const shell = useShellMode();
    const storageKey = useMemo(() => `cadence-controls-sheet:${routeKey}`, [routeKey]);
    const [open, setOpen] = useState(false);
    const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");
    const [drillId, setDrillId] = useState<string | null>(null);
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        if (!sections.length) return;

        const persisted = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
        const nextSectionId = persisted && sections.some((section) => section.id === persisted)
            ? persisted
            : sections[0].id;
        setActiveSectionId(nextSectionId);
    }, [sections, storageKey]);

    useEffect(() => {
        if (!activeSectionId || typeof window === "undefined") return;
        window.localStorage.setItem(storageKey, activeSectionId);
    }, [activeSectionId, storageKey]);

    const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

    if (shell.isCompact) {
        // A popover, not a sheet: these are two or three switches, so a full
        // takeover costs more than it carries. Longer lists drill into a
        // sub-panel that slides in the way iOS menus do.
        const drillSection = sections.find((section) => section.id === drillId) ?? null;
        const slide = (from: number) => (reduceMotion
            ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
            : { initial: { opacity: 0, x: from }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -from } });

        return (
            <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setDrillId(null); }}>
                <Tip label={triggerLabel}><Popover.Trigger asChild>
                    <button type="button" className="mobile-icon-button" aria-label={triggerLabel}>
                        <SlidersHorizontal size={20} aria-hidden="true" />
                    </button>
                </Popover.Trigger></Tip>

                <Popover.Content
                    side="bottom"
                    align="end"
                    aria-label={title}
                    className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[70dvh] overflow-y-auto overscroll-contain p-3"
                >
                    <AnimatePresence initial={false} mode="wait">
                        {drillSection ? (
                            <motion.div key={drillSection.id} {...slide(18)} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => setDrillId(null)}
                                    className="touch-target flex min-h-11 w-full items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-twilight-text hover:bg-white/[0.05]"
                                >
                                    <ChevronLeft size={18} aria-hidden="true" />
                                    {drillSection.label}
                                </button>
                                <div className="px-1 pb-1">{drillSection.content}</div>
                            </motion.div>
                        ) : (
                            <motion.div key="root" {...slide(-18)} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="space-y-3">
                                {description ? <p className="px-1 pt-1 text-sm text-twilight-text-soft">{description}</p> : null}

                                {sections.map((section) => section.display === "drill" ? (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => setDrillId(section.id)}
                                        aria-haspopup="menu"
                                        className="touch-target flex min-h-12 w-full items-center gap-2 rounded-2xl border border-twilight-border/30 bg-twilight-base/40 px-3.5 text-sm font-medium text-twilight-text transition-colors hover:bg-white/[0.05]"
                                    >
                                        <span className="flex-1 text-left">{section.label}</span>
                                        {section.summary ? <span className="text-twilight-text-soft">{section.summary}</span> : null}
                                        <ChevronRight size={16} aria-hidden="true" className="text-twilight-text-muted" />
                                    </button>
                                ) : (
                                    <section key={section.id} aria-label={section.label} className="space-y-2">
                                        <h3 className={SECTION_LABEL}>{section.label}</h3>
                                        <div className="px-1">{section.content}</div>
                                    </section>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Popover.Content>
            </Popover.Root>
        );
    }

    return (
        <Dialog.Dialog open={open} onOpenChange={setOpen}>
            <Dialog.DialogTrigger asChild>
                <button
                    type="button"
                    className={[
                        "touch-target inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-twilight-border/45 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft",
                        "hover:bg-white/[0.06] hover:text-twilight-text",
                        triggerClassName,
                    ].join(" ").trim()}
                >
                    <SlidersHorizontal size={15} aria-hidden="true" />
                    {triggerLabel}
                </button>
            </Dialog.DialogTrigger>

            <Dialog.DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl">
                <div className="border-b border-twilight-border/50 px-5 pb-4 pt-5">
                    <Dialog.DialogHeader className="space-y-1 text-left">
                        <Dialog.DialogTitle>{title}</Dialog.DialogTitle>
                        {description ? <Dialog.DialogDescription>{description}</Dialog.DialogDescription> : null}
                    </Dialog.DialogHeader>

                    {sections.length > 1 ? (
                        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hidden">
                            {sections.map((section) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => setActiveSectionId(section.id)}
                                    className={`touch-target inline-flex min-h-10 shrink-0 items-center rounded-2xl border px-3.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                                        activeSection?.id === section.id
                                            ? "border-accent-primary/30 bg-accent-primary/14 text-accent-primary"
                                            : "border-twilight-border/45 bg-white/[0.03] text-twilight-text-soft"
                                    }`}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div className="max-h-[70dvh] overflow-y-auto px-5 py-5 scrollbar-thin">
                    {activeSection?.content}
                </div>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}
