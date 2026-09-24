import type React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../primitives/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../primitives/Select";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { FIELD_LABEL } from "../tasks/task-choice-options";

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

/** Borderless value on the right of a FieldRow; opens a picker. */
export const VALUE_BTN = "flex min-h-10 max-w-full cursor-pointer items-center rounded-lg px-2.5 text-right text-[13px] text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/** Titled cluster of related fields inside a detail card. */
export function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-1 border-t border-twilight-border/25 px-4 py-4 first:border-t-0" aria-label={title}>
            <p className={`${FIELD_LABEL} mb-1`}>{title}</p>
            {children}
        </section>
    );
}

/** Label above a full-width control — for choice rows that need the width. */
export function FieldBlock({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2 py-1.5" role="group" aria-label={label}>
            <span className="flex items-center gap-2 text-[13px] text-twilight-text-muted">
                <Icon size={14} className="shrink-0 opacity-80" aria-hidden="true" />
                {label}
            </span>
            {children}
        </div>
    );
}

/** Label left, value right — for single-value rows. `hint` sits under the label when the value side is a toggle. */
export function FieldRow({ icon: Icon, label, hint, children }: {
    icon: React.ElementType;
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-11 items-center justify-between gap-3" role="group" aria-label={label}>
            <span className="flex shrink-0 items-center gap-2 text-[13px] text-twilight-text-muted">
                <Icon size={14} className="shrink-0 opacity-80" aria-hidden="true" />
                <span className="flex flex-col">
                    {label}
                    {hint ? <span className="text-xs text-twilight-text-soft">{hint}</span> : null}
                </span>
            </span>
            <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
        </div>
    );
}

/** Radix Select reserves "" for "no value", so the empty choice needs its own key. */
const NONE = "__none";

/** A FieldRow value that picks one option: the Select menu on desktop, the OS picker on compact. "" is the empty choice. */
export function ValueSelect({ label, value, onChange, options }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    const { isCompact } = useShellMode();
    const tone = value ? "text-twilight-text-soft" : "text-twilight-text-muted";
    if (isCompact) {
        return (
            <span className="relative flex min-w-0 items-center">
                <select
                    aria-label={label}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`${VALUE_BTN} appearance-none truncate bg-transparent pr-8 ${tone}`}
                >
                    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 size-4 opacity-50" aria-hidden="true" />
            </span>
        );
    }
    return (
        <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
            <SelectTrigger
                aria-label={label}
                className={`${VALUE_BTN} h-auto w-auto gap-1.5 border-0 bg-transparent py-0 shadow-none focus:ring-2 focus:ring-accent-primary/50 data-[state=open]:bg-white/[0.06] ${tone}`}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="max-w-64">
                {options.map((o) => <SelectItem key={o.value} value={o.value || NONE}>{o.label}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}
