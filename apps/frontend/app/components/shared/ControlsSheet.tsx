import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import * as Dialog from "../primitives/Dialog";

export interface ControlsSheetSection {
    id: string;
    label: string;
    content: React.ReactNode;
}

interface ControlsSheetProps {
    routeKey: string;
    title: string;
    description?: string;
    sections: ControlsSheetSection[];
    triggerLabel?: string;
    triggerClassName?: string;
}

export function ControlsSheet({
    routeKey,
    title,
    description,
    sections,
    triggerLabel = "Controls",
    triggerClassName = "",
}: ControlsSheetProps) {
    const storageKey = useMemo(() => `cadence-controls-sheet:${routeKey}`, [routeKey]);
    const [open, setOpen] = useState(false);
    const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");

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
