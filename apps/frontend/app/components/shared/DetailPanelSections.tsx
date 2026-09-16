import type React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../primitives/Button";

export const CARD = "rounded-[1.25rem] border border-twilight-border/35 bg-white/[0.02]";
export const PANEL_TRIGGER = `${CARD} flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:border-twilight-border/50 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50`;

/** Collapsed pane: icon, name, one-line summary, chevron. */
export function PanelTrigger({ icon: Icon, title, summary, onOpen }: {
    icon: React.ElementType;
    title: string;
    summary: string;
    onOpen: () => void;
}) {
    return (
        <Button variant="ghost" size="none" type="button" onClick={onOpen} aria-expanded={false} className={`${PANEL_TRIGGER} font-normal`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-twilight-text-muted">
                <Icon size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-twilight-text">{title}</span>
                <span className="block truncate text-xs text-twilight-text-muted">{summary}</span>
            </span>
            <ChevronDown size={16} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
        </Button>
    );
}

/** Open pane header: name + a plain "Done" that collapses the section. */
export function PanelHeader({ title, summary, onDone }: { title: string; summary?: string; onDone: () => void }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="text-sm font-medium text-twilight-text">{title}</p>
                {summary ? <p className="truncate text-xs text-twilight-text-muted">{summary}</p> : null}
            </div>
            <Button variant="ghost" size="none"
                type="button"
                onClick={onDone}
                aria-expanded={true}
                className="flex min-h-9 shrink-0 cursor-pointer items-center rounded-lg px-3 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                Done
            </Button>
        </div>
    );
}
