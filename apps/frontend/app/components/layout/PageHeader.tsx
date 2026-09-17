import type { ReactNode } from "react";

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
                        <span className="hidden min-w-0 items-baseline gap-2 truncate text-[13px] text-twilight-text-soft md:flex">
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
