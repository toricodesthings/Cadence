import { Link } from "react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/** The grouped card compact navigation rows sit in (Browse, the workspace menu). */
export const NAV_GROUP = "overflow-hidden rounded-2xl border border-twilight-border/60 bg-twilight-surface/40 p-1";
/** Small caps heading above a `NAV_GROUP`, set outside the card like an inset grouped list. */
export const NAV_GROUP_LABEL = "px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-soft/90";

const ROW = "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] text-twilight-text transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/**
 * One compact navigation row: a link with `to`, else a button. `leading`
 * replaces the icon (a list's emoji or colour dot); `tone` colours the icon.
 */
export function NavigationRow({ to, icon: Icon, leading, tone, children, detail, onClick }: {
    to?: string; icon?: LucideIcon; leading?: ReactNode; tone?: string; children: ReactNode; detail?: ReactNode; onClick?: () => void;
}) {
    const body = <>
        <span className="flex w-5 shrink-0 items-center justify-center" aria-hidden="true">
            {leading ?? (Icon ? <Icon size={18} className="text-[var(--row-tone)]" /> : null)}
        </span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {detail}
        <ChevronRight size={16} className="shrink-0 text-twilight-text-soft/90" aria-hidden="true" />
    </>;
    const style = { "--row-tone": tone ?? "var(--accent-primary)" } as CSSProperties;
    return to
        ? <Link to={to} onClick={onClick} className={ROW} style={style}>{body}</Link>
        : <button type="button" onClick={onClick} className={ROW} style={style}>{body}</button>;
}
