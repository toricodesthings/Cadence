import { Link, useLocation } from "react-router";
import type { LucideIcon } from "lucide-react";

interface NavLinkProps {
    icon: LucideIcon;
    label: string;
    href: string;
    count?: React.ReactNode;
    /** Show a subtle dot indicator next to the icon */
    showDot?: boolean;
    /** Tailwind class for active icon/text color, e.g. "text-[var(--color-nav-planner)]" */
    activeColor?: string;
    /** Tailwind class for active background, e.g. "bg-[var(--color-nav-planner)]/15" */
    activeBg?: string;
    /** Tailwind class for hover color */
    hoverColor?: string;
}

/** Reusable navigation item with optional unread count badge */
export function NavLink({
    icon: Icon,
    label,
    href,
    count,
    showDot,
    activeColor = "text-[var(--color-nav-planner)]",
    activeBg = "bg-[var(--color-nav-planner)]/15",
    hoverColor = "group-hover:text-[var(--color-nav-planner)]/70",
}: NavLinkProps) {
    const location = useLocation();
    const active = location.pathname === href;

    return (
        <Link
            to={href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px]
                transition-colors duration-200 cursor-pointer
                ${active
                    ? `${activeBg} text-twilight-text font-medium`
                    : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.03]"
                }
            `}
        >
            <span className="relative shrink-0">
                <Icon
                    size={18}
                    aria-hidden="true"
                    className={`transition-colors ${active ? activeColor : `text-twilight-text-muted ${hoverColor}`}`}
                />
                {showDot && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-lantern/70" aria-hidden="true" />
                )}
            </span>
            <span className="flex-1 truncate">{label}</span>
            {count !== undefined && count !== 0 && (
                <span className="text-[13px] tabular-nums text-twilight-text-muted" aria-label={`${count} items`}>{count}</span>
            )}
        </Link>
    );
}

