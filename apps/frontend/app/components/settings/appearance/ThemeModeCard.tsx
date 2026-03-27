import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "../../../lib/utils";

interface ThemeModeCardProps {
    mode: "twilight" | "daylight" | "system";
    selected: boolean;
    onSelect: () => void;
}

const MODE_META = {
    twilight: {
        icon: Moon,
        label: "Twilight",
        desc: "Dark, atmospheric",
        bg: "#111827",
        surface: "#1e293b",
        accent: "var(--accent-primary)",
        text: "#e2e8f0",
    },
    daylight: {
        icon: Sun,
        label: "Daylight",
        desc: "Light, airy",
        bg: "#f8fafc",
        surface: "#ffffff",
        accent: "var(--accent-primary)",
        text: "#1e293b",
    },
    system: {
        icon: Monitor,
        label: "System",
        desc: "Match device",
        bg: "linear-gradient(135deg, #111827 50%, #f8fafc 50%)",
        surface: "",
        accent: "var(--accent-primary)",
        text: "#e2e8f0",
    },
} as const;

function MiniPreview({ mode }: { mode: "twilight" | "daylight" | "system" }) {
    const meta = MODE_META[mode];

    if (mode === "system") {
        return (
            <div className="relative h-16 w-full overflow-hidden rounded-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-[#111827] from-50% to-[#f8fafc] to-50%" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <meta.icon size={18} className="text-twilight-text-soft" />
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex h-16 w-full flex-col justify-between overflow-hidden rounded-lg p-2"
            style={{ background: meta.bg }}
        >
            <div className="flex gap-1">
                <div className="h-1.5 w-6 rounded-full" style={{ background: meta.accent }} />
                <div className="h-1.5 w-4 rounded-full opacity-30" style={{ background: meta.text }} />
            </div>
            <div className="flex gap-1.5">
                <div className="h-3 w-full rounded" style={{ background: meta.surface }} />
                <div className="h-3 w-full rounded" style={{ background: meta.surface }} />
            </div>
        </div>
    );
}

export function ThemeModeCard({ mode, selected, onSelect }: ThemeModeCardProps) {
    const meta = MODE_META[mode];
    const Icon = meta.icon;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                "group flex w-full flex-col gap-2.5 rounded-2xl border p-3 text-left transition-all duration-200",
                "cursor-pointer",
                selected
                    ? "border-[color:var(--accent-primary)]/40 bg-[color:var(--accent-primary)]/[0.06]"
                    : "border-twilight-border-light bg-white/[0.02] hover:bg-white/[0.04]",
            )}
        >
            <MiniPreview mode={mode} />
            <div className="flex items-center gap-2">
                <Icon
                    size={14}
                    className={cn(
                        "transition-colors",
                        selected ? "text-[color:var(--accent-primary)]" : "text-twilight-text-muted",
                    )}
                />
                <span className="text-[13px] font-medium text-twilight-text">{meta.label}</span>
            </div>
            <span className="text-[11px] text-twilight-text-muted">{meta.desc}</span>
        </button>
    );
}
