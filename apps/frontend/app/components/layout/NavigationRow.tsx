import { Link } from "react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function NavigationRow({ to, icon: Icon, children, detail, onClick }: {
    to: string; icon: LucideIcon; children: ReactNode; detail?: ReactNode; onClick?: () => void;
}) {
    return <Link to={to} onClick={onClick} className="mobile-navigation-row flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-twilight-text transition-colors hover:bg-twilight-surface active:bg-twilight-surface">
        <Icon size={21} className="shrink-0 text-accent-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words">{children}</span>
        {detail}
        <ChevronRight size={18} className="shrink-0 text-twilight-text-soft" aria-hidden="true" />
    </Link>;
}
