import { PanelRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Tip } from "../primitives";
import type { RailView } from "../../stores/right-panel-store";

/**
 * Compact icon toggle pinned to the top-right of the shared right rail. Lets the
 * user flip between the contextual panel and the Cadence assistant whenever the
 * contextual panel is present, without closing either. Selecting "Cadence" while
 * the assistant is closed opens it (handled by the parent's `onChange`).
 *
 * The active pill slides via a shared `layoutId`, so switching feels continuous
 * rather than a hard swap. Under reduced motion the global guard zeroes it out.
 */
export function RailViewToggle({
    view,
    onChange,
    contextLabel = "Panel",
}: {
    view: RailView;
    onChange: (view: RailView) => void;
    contextLabel?: string;
}) {
    const tabs: { id: RailView; label: string; icon: typeof PanelRight }[] = [
        { id: "context", label: contextLabel, icon: PanelRight },
        { id: "assistant", label: "Cadence", icon: Sparkles },
    ];

    return (
        <div
            role="tablist"
            aria-label="Right panel view"
            className="pointer-events-auto absolute right-2.5 top-2.5 z-40 flex items-center gap-0.5 rounded-full border border-twilight-border bg-twilight-deep/85 p-0.5 shadow-lg backdrop-blur-xl"
        >
            {tabs.map(({ id, label, icon: Icon }) => {
                const active = view === id;
                return (
                    <Tip key={id} label={label} side="bottom">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-label={label}
                            onClick={() => onChange(id)}
                            className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-colors cursor-pointer ${
                                active
                                    ? "text-twilight-text"
                                    : "text-twilight-text-muted hover:text-twilight-text-soft"
                            }`}
                        >
                            {active ? (
                                <motion.span
                                    layoutId="rail-toggle-active"
                                    className="absolute inset-0 rounded-full bg-accent-primary/18 ring-1 ring-accent-primary/25"
                                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                />
                            ) : null}
                            <Icon size={14} className="relative" aria-hidden="true" />
                        </button>
                    </Tip>
                );
            })}
        </div>
    );
}
