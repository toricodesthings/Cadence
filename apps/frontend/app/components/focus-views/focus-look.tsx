import {
    BookOpen,
    Brain,
    Briefcase,
    CalendarX2,
    Clock,
    CloudFog,
    Coffee,
    Flag,
    Heart,
    House,
    Leaf,
    Sparkles,
    Star,
    Target,
    UserCheck,
    Zap,
    type LucideIcon,
} from "lucide-react";
import type { FocusViewColor, FocusViewIcon } from "@cadence/contracts/settings";

export const FOCUS_ICONS: Record<FocusViewIcon, LucideIcon> = {
    Zap,
    Clock,
    CalendarX: CalendarX2,
    UserCheck,
    Brain,
    CloudFog,
    Sparkles,
    Star,
    Flag,
    Target,
    Coffee,
    BookOpen,
    Briefcase,
    House,
    Heart,
    Leaf,
};

export const FOCUS_COLORS: Record<FocusViewColor, { label: string; tone: string }> = {
    lantern: { label: "Lantern", tone: "var(--color-lantern)" },
    ember: { label: "Ember", tone: "var(--color-ember-red)" },
    rose: { label: "Rose", tone: "var(--color-personal)" },
    violet: { label: "Violet", tone: "var(--color-violet)" },
    sapphire: { label: "Sapphire", tone: "var(--color-sapphire)" },
    moonlit: { label: "Moonlit", tone: "var(--color-moonlit)" },
    jade: { label: "Jade", tone: "var(--color-forest-green)" },
};

export const DEFAULT_ICON: FocusViewIcon = "Sparkles";
export const DEFAULT_COLOR: FocusViewColor = "lantern";

export const toneOf = (color: FocusViewColor | null | undefined) => FOCUS_COLORS[color ?? DEFAULT_COLOR].tone;
export const iconOf = (icon: FocusViewIcon | null | undefined) => FOCUS_ICONS[icon ?? DEFAULT_ICON];

export function FocusBubble({
    icon,
    color,
    size = 32,
}: {
    icon: FocusViewIcon | null | undefined;
    color: FocusViewColor | null | undefined;
    size?: number;
}) {
    const Icon = iconOf(icon);
    return (
        <span
            aria-hidden="true"
            style={{ "--tone": toneOf(color), width: size, height: size } as React.CSSProperties}
            className="flex shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tone)_14%,transparent)] text-[var(--tone)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--tone)_22%,transparent)]"
        >
            <Icon size={Math.round(size * 0.47)} />
        </span>
    );
}
