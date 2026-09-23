import { useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "../../lib/utils";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { Button } from "../primitives/Button";
import { Switch, Tip } from "../primitives";
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogTitle } from "../primitives/Dialog";
import * as AlertDialog from "../primitives/AlertDialog";
import { UtilitySheet } from "./UtilitySheet";

/**
 * The one creation layout (schedule blocks, events, routines): a header with a
 * live summary, an optional band, a scrolling body and pinned actions. Desktop
 * gets a dialog, compact shells the shared sheet, so the two never drift (§4.5).
 * A dirty draft asks before it's thrown away.
 */

const BAND = "shrink-0 overflow-y-auto [scrollbar-gutter:stable]";
const TILE = "rounded-2xl border border-white/[0.06] bg-white/[0.03]";

type ComposerIcon = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
/** The nav wayfinding shade a creator belongs to: events the schedule's, routines the routines'. */
export type ComposerTone = "primary" | "schedule" | "habits";
const TONE_VAR: Record<ComposerTone, string> = {
    primary: "var(--accent-primary)",
    schedule: "var(--accent-nav-schedule)",
    habits: "var(--accent-nav-habits)",
};
const SUBMIT_TONE: Record<ComposerTone, string> = {
    primary: "bg-accent-primary/18 text-accent-primary hover:bg-accent-primary/26",
    schedule: "bg-accent-nav-schedule/18 text-accent-nav-schedule hover:bg-accent-nav-schedule/26",
    habits: "bg-accent-nav-habits/18 text-accent-nav-habits hover:bg-accent-nav-habits/26",
};

export interface ComposerProps {
    open: boolean;
    title: string;
    /** Sits before the title at its size, so each creator reads at a glance. */
    icon?: ComposerIcon;
    /** Colours the icon and the dialog's glow. */
    tone?: ComposerTone;
    subtitle?: ReactNode;
    /** Sits between the header and the body, e.g. a type switcher. */
    band?: ReactNode;
    /** The primary action (`ComposerSubmit`); Cancel is built in and asks before discarding. */
    footer: ReactNode;
    isDirty: boolean;
    discardTitle?: string;
    discardDescription?: string;
    onClose: () => void;
    /** Renders in place instead of in a dialog, e.g. the desktop quick-capture window. */
    inline?: boolean;
    children: ReactNode;
}

/**
 * One creator's contents for `Composer`, from its `use…Composer` hook, so a host
 * can hold several drafts in one shell (Quick Add's tabs) or wrap one alone.
 */
export type ComposerDraft = Pick<ComposerProps, "title" | "icon" | "tone" | "subtitle" | "band" | "footer" | "isDirty" | "discardTitle" | "discardDescription" | "children"> & {
    /** Empties the draft; hosts call it on close. */
    reset: () => void;
};

export function Composer({
    open,
    title,
    icon: Icon,
    tone = "primary",
    subtitle,
    band,
    footer,
    isDirty,
    discardTitle = "Discard this draft?",
    discardDescription = "This closes the composer and loses what you've typed.",
    onClose,
    inline = false,
    children,
}: ComposerProps) {
    const shell = useShellMode();
    const [discardOpen, setDiscardOpen] = useState(false);
    const requestClose = () => (isDirty ? setDiscardOpen(true) : onClose());

    const bandNode = band ? <div className={`${BAND} border-b border-white/[0.06] px-5 py-4 sm:px-6`}>{band}</div> : null;
    const body = (
        <div className="min-h-0 flex-auto overflow-y-auto [scrollbar-gutter:stable] px-5 py-4 sm:px-6 sm:py-5">
            <div className="space-y-5">{children}</div>
        </div>
    );
    const footerNode = (
        <div className={`${BAND} flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4 sm:px-6`}>
            <Button variant="ghost" size="md" onClick={requestClose}>Cancel</Button>
            {footer}
        </div>
    );

    const toneStyle = { "--glow-tone": TONE_VAR[tone] } as React.CSSProperties;
    const Title = inline ? "h2" : DialogTitle;
    const Description = inline ? "p" : DialogDescription;
    const frame = (
        <>
            <div className={`${BAND} flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 pb-4 pt-5 text-left sm:px-6 sm:pb-5 sm:pt-6`}>
                <div className="min-w-0 space-y-1.5">
                    <Title className="flex items-center gap-2.5 font-display text-xl tracking-tight text-twilight-text">
                        {Icon ? <Icon size={20} className="dialog-glow-icon shrink-0" aria-hidden /> : null}
                        {title}
                    </Title>
                    <Description className="text-sm text-twilight-text-soft">{subtitle}</Description>
                </div>
                {inline ? null : <DialogCloseButton className="-mt-2" />}
            </div>
            {bandNode}
            {body}
            {footerNode}
        </>
    );

    return (
        <>
            {inline ? (
                <section aria-label={title} style={toneStyle} className="surface-dialog dialog-glow relative flex max-h-[90dvh] flex-col overflow-hidden rounded-[30px]">{frame}</section>
            ) : shell.isCompact ? (
                <UtilitySheet title={title} subtitle={subtitle} open={open} onClose={requestClose} band={bandNode} footer={footerNode} scrollable={false} flush>
                    {body}
                </UtilitySheet>
            ) : (
                <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
                    <DialogContent
                        style={toneStyle}
                        className="dialog-glow flex w-[min(calc(100vw-1.5rem),40rem)] flex-col gap-0 overflow-hidden rounded-[30px] p-0 sm:max-h-[90dvh] sm:max-w-2xl"
                        hideCloseButton
                    >
                        {frame}
                    </DialogContent>
                </Dialog>
            )}

            <AlertDialog.Root open={discardOpen} onOpenChange={setDiscardOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>{discardTitle}</AlertDialog.Title>
                        <AlertDialog.Description>{discardDescription}</AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="secondary" className="border-white/10 bg-white/5">Keep editing</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button variant="danger" onClick={() => { setDiscardOpen(false); onClose(); }}>Discard draft</Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </>
    );
}

/** The composer's primary action. */
export function ComposerSubmit({
    onSubmit,
    submitLabel,
    icon: Icon,
    disabled,
    tone = "primary",
}: {
    onSubmit: () => void;
    submitLabel: string;
    icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
    disabled?: boolean;
    tone?: ComposerTone;
}) {
    return (
        <Button
            variant="primary"
            size="md"
            onClick={onSubmit}
            disabled={disabled}
            className={`${SUBMIT_TONE[tone]} disabled:opacity-40`}
        >
            <Icon size={14} aria-hidden />
            {submitLabel}
        </Button>
    );
}

/** The big underlined name field every composer opens on, with an optional mark (emoji) before it. */
export function ComposerTitle({
    leading,
    inputRef,
    ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode; inputRef?: React.Ref<HTMLInputElement> }) {
    return (
        <div data-focus-container className="flex items-end gap-3 border-b border-white/[0.06] transition-colors focus-within:border-accent-primary/50">
            {leading ? <div className="mb-2 shrink-0">{leading}</div> : null}
            <input
                ref={inputRef}
                {...input}
                className="min-w-0 flex-1 bg-transparent pb-3 font-display text-xl text-twilight-text outline-none placeholder:text-twilight-text-muted/60"
            />
        </div>
    );
}

export interface ComposerTabOption<T extends string> {
    id: T;
    label: string;
    icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
    /** Overrides the selected colours, e.g. the schedule accent for events. */
    activeClassName?: string;
}

/** One-of-N segmented control: the composer's type switch, Once/Repeats, cadence, time mode. */
export function ComposerTabs<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    role = "radiogroup",
}: {
    options: ReadonlyArray<ComposerTabOption<T>>;
    value: T;
    onChange: (value: T) => void;
    ariaLabel: string;
    /** "tablist" when the choice swaps the whole body. */
    role?: "radiogroup" | "tablist";
}) {
    const itemRole = role === "tablist" ? "tab" : "radio";
    return (
        <div
            role={role}
            aria-label={ariaLabel}
            className={`grid gap-1.5 p-1 ${TILE}`}
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        >
            {options.map((option) => {
                const active = option.id === value;
                const Icon = option.icon;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role={itemRole}
                        aria-selected={itemRole === "tab" ? active : undefined}
                        aria-checked={itemRole === "radio" ? active : undefined}
                        onClick={() => onChange(option.id)}
                        className={cn(
                            "flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50",
                            active
                                ? option.activeClassName ?? "bg-accent-primary/15 text-accent-primary"
                                : "text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text",
                        )}
                    >
                        {Icon ? <Icon size={15} aria-hidden /> : null}
                        <span className="truncate">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export type WeekdayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
export const WEEKDAY_ORDER: WeekdayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const WEEKDAY_LABELS: Record<WeekdayCode, { short: string; long: string }> = {
    MO: { short: "Mon", long: "Monday" },
    TU: { short: "Tue", long: "Tuesday" },
    WE: { short: "Wed", long: "Wednesday" },
    TH: { short: "Thu", long: "Thursday" },
    FR: { short: "Fri", long: "Friday" },
    SA: { short: "Sat", long: "Saturday" },
    SU: { short: "Sun", long: "Sunday" },
};

/** Mon–Sun toggles; at least one day always stays on. */
export function WeekdayPicker({ value, onChange }: { value: WeekdayCode[]; onChange: (days: WeekdayCode[]) => void }) {
    return (
        <div role="group" aria-label="Select days of the week" className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAY_ORDER.map((day) => {
                const active = value.includes(day);
                return (
                    <Tip key={day} label={WEEKDAY_LABELS[day].long} side="top">
                        <button
                            type="button"
                            aria-label={WEEKDAY_LABELS[day].long}
                            aria-pressed={active}
                            onClick={() => {
                                if (active && value.length === 1) return;
                                onChange(active ? value.filter((item) => item !== day) : [...value, day]);
                            }}
                            className={`flex min-h-11 w-full cursor-pointer select-none touch-manipulation items-center justify-center rounded-xl border text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                active
                                    ? "border-accent-primary/30 bg-accent-primary/15 text-accent-primary"
                                    : "border-white/[0.06] bg-white/[0.02] text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text"
                            }`}
                        >
                            {WEEKDAY_LABELS[day].short}
                        </button>
                    </Tip>
                );
            })}
        </div>
    );
}

/** A tile with a label, one line of consequence copy and a switch; optional detail underneath. */
export function ComposerToggle({
    icon: Icon,
    iconClassName = "text-accent-primary",
    label,
    description,
    checked,
    onCheckedChange,
    ariaLabel,
    children,
}: {
    icon?: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
    iconClassName?: string;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    ariaLabel: string;
    children?: ReactNode;
}) {
    return (
        <div className={`${TILE} px-4 py-3`}>
            <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    {Icon ? <Icon size={15} className={`shrink-0 ${iconClassName}`} aria-hidden /> : null}
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium text-twilight-text">{label}</p>
                        <p className="text-xs text-twilight-text-soft">{description}</p>
                    </div>
                </div>
                <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={ariaLabel} />
            </div>
            {children ? <div className="mt-3 border-t border-white/[0.05] pt-3">{children}</div> : null}
        </div>
    );
}

/** Everything optional folds in here, closed by default; `summary` echoes what's set inside. */
export function ComposerMore({ summary, children }: { summary?: string | null; children: ReactNode }) {
    return (
        <details className={`group ${TILE}`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-2xl px-4 text-sm text-twilight-text-soft transition-colors hover:text-twilight-text group-open:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal size={15} className="shrink-0 text-accent-primary" aria-hidden="true" />
                <span className="flex-1">More options</span>
                {summary ? <span className="truncate text-xs text-twilight-text-muted group-open:hidden">{summary}</span> : null}
                <ChevronDown size={15} className="shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t border-white/[0.05] px-4 pb-4 pt-4">{children}</div>
        </details>
    );
}

/** Class for plain fields (date, select, textarea) inside a composer. */
export const COMPOSER_FIELD = "w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-twilight-text outline-none placeholder:text-twilight-text-muted/60 focus-visible:ring-2 focus-visible:ring-accent-primary/50";
