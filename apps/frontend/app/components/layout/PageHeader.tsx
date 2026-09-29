import type { ReactNode } from "react";
import { ChevronLeft, SlidersHorizontal } from "lucide-react";
import * as Popover from "../primitives/Popover";

/** Surface shared by every page header (desktop bar and compact variants). */
export const PAGE_HEADER_SURFACE =
    "surface-shell photo-shell-surface layer-shell-header shrink-0 border-b border-twilight-border";

export interface PageHeaderIdentityProps {
    icon?: ReactNode;
    eyebrow?: ReactNode;
    title: ReactNode;
    meta?: ReactNode;
    accentColor?: string;
    compact?: boolean;
}

export function PageHeaderIdentity({ icon, eyebrow, title, meta, accentColor, compact = false }: PageHeaderIdentityProps) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            {icon ? (
                <span
                    className="flex shrink-0 items-center justify-center text-accent-primary"
                    style={accentColor ? { color: accentColor } : undefined}
                >
                    {icon}
                </span>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
                {eyebrow ? (
                    <p className="text-[10.5px] font-semibold uppercase leading-none tracking-[0.18em] text-twilight-text-muted">
                        {eyebrow}
                    </p>
                ) : null}
                <div className="flex min-w-0 items-baseline gap-2">
                    <h1 className={`truncate font-display font-semibold leading-tight tracking-tight text-twilight-text ${compact ? "text-base" : "text-lg"}`}>
                        {title}
                    </h1>
                    {meta && !compact ? (
                        <span className="hidden min-w-0 shrink-[999] items-baseline gap-2 truncate text-[13px] text-twilight-text-soft md:flex">
                            <span aria-hidden="true" className="text-twilight-text-muted">·</span>
                            {meta}
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

/** Single-row desktop page header, sized to the shared shell-header height so it lines up with side-panel headers. */
export function PageHeader({
    leading,
    actions,
    ...identity
}: PageHeaderIdentityProps & { leading?: ReactNode; actions?: ReactNode }) {
    return (
        <header className={`${PAGE_HEADER_SURFACE} h-(--shell-header-h)`}>
            <div className="flex h-full items-center gap-3 px-6 lg:px-8">
                {leading}
                <PageHeaderIdentity {...identity} />
                {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
        </header>
    );
}

/** Phone header type: eyebrow (or the zoom-out label), a large display title, and a quiet meta line. */
export function PhoneHeaderIdentity({ eyebrow, title, meta, backLabel }: {
    eyebrow?: ReactNode;
    title: ReactNode;
    meta?: ReactNode;
    backLabel?: string | null;
}) {
    return (
        <span className="flex min-w-0 flex-col gap-0.5 text-left">
            {backLabel || eyebrow ? (
                <span className="flex items-center gap-0.5 text-[12px] font-semibold uppercase leading-none tracking-[0.14em] text-twilight-text-muted">
                    {backLabel ? (
                        <>
                            <ChevronLeft size={14} aria-hidden="true" className="-ml-1 text-accent-primary" />
                            <span className="text-accent-primary normal-case tracking-normal">{backLabel}</span>
                        </>
                    ) : eyebrow}
                </span>
            ) : null}
            <span className="truncate font-display text-[22px] font-semibold leading-tight tracking-tight text-twilight-text">
                {title}
            </span>
            {meta ? <span className="truncate text-[12.5px] text-twilight-text-soft">{meta}</span> : null}
        </span>
    );
}

/** Phone page header: one row. The label above the title zooms out when `backLabel` is set; `options` open under a sliders icon. */
export function PhonePageHeader({ eyebrow, title, meta, backLabel, onZoomOut, actions, options }: {
    eyebrow: string;
    title: string;
    /** Quiet line under the title, e.g. "Today · light". */
    meta?: string | null;
    backLabel?: string | null;
    onZoomOut?: () => void;
    actions?: ReactNode;
    options?: ReactNode;
}) {
    const identity = <PhoneHeaderIdentity eyebrow={eyebrow} title={title} meta={meta} backLabel={backLabel} />;

    return (
        <header className={`${PAGE_HEADER_SURFACE} safe-header-top px-4 pb-2`}>
            <div className="flex min-h-[52px] items-center gap-2">
                <h1 className="min-w-0 flex-1">
                    {backLabel && onZoomOut ? (
                        <button
                            type="button"
                            onClick={onZoomOut}
                            aria-label={`${title}. Back to ${backLabel}`}
                            className="-mx-1 flex min-h-11 max-w-full cursor-pointer rounded-xl px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            {identity}
                        </button>
                    ) : identity}
                </h1>
                {actions}
                {options && (
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button
                                type="button"
                                className="btn-icon touch-target rounded-full text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                                aria-label="View and display options"
                            >
                                <SlidersHorizontal size={18} aria-hidden="true" />
                            </button>
                        </Popover.Trigger>
                        <Popover.Content side="bottom" align="end" className="w-[min(20rem,calc(100vw-2rem))] p-3">
                            {options}
                        </Popover.Content>
                    </Popover.Root>
                )}
            </div>
        </header>
    );
}

/** The view choice at the top of a phone header's options; picking one closes the popover. */
export function PhoneViewPicker<T extends string>({ value, options, onChange }: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div role="radiogroup" aria-label="View" className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-twilight-border/40 p-1">
            {options.map((option) => (
                <Popover.Close asChild key={option.value}>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={value === option.value}
                        onClick={() => onChange(option.value)}
                        className={`min-h-11 cursor-pointer rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                            value === option.value ? "bg-accent-primary/20 text-accent-primary" : "text-twilight-text-soft hover:bg-white/[0.05]"
                        }`}
                    >
                        {option.label}
                    </button>
                </Popover.Close>
            ))}
        </div>
    );
}
