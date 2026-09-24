import { PlainNavCount } from "./PlainNavCount";
import { ActivityBadge } from "../primitives/ActivityBadge";
import { Link, useLocation } from "react-router";
import type { LucideIcon } from "lucide-react";

interface NavLinkProps {
    icon: LucideIcon;
    label: string;
    href: string;
    count?: React.ReactNode;
    countLabel?: string;
    countAppearance?: "plain" | "badge";
    /** Show a subtle dot indicator next to the icon */
    showDot?: boolean;
    /** Tailwind class for active icon/text color, e.g. "text-accent-primary" */
    activeColor?: string;
    /** Tailwind class for active background, e.g. "bg-accent-primary/15" */
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
    countLabel = "items",
    countAppearance = "badge",
    showDot,
    activeColor = "text-accent-primary",
    activeBg = "bg-accent-primary/15",
    hoverColor = "group-hover:text-accent-primary/70",
}: NavLinkProps) {
    const location = useLocation();
    const active = location.pathname === href;

    return (
        <Link
            to={href}
            aria-current={active ? "page" : undefined}
            aria-label={typeof count === "number" ? `${label}, ${count} ${countLabel}` : label}
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
                    <ActivityBadge className="absolute -right-0.5 -top-0.5" />
                )}
            </span>
            <span className="flex-1 truncate">{label}</span>
            {count !== undefined && count !== 0 && (
                countAppearance === "plain"
                    ? <PlainNavCount count={count} />
                    : <ActivityBadge count={count} />
            )}
        </Link>
    );
}
