/** Map backend color accent tokens to hex values from the CSS theme */
const ACCENT_MAP: Record<string, string> = {
    "luminous-amber": "#e8a44a",
    "moonlit-blue": "#7eb8d4",
    sapphire: "#4a90d9",
    "ember-red": "#d97756",
    "forest-green": "#5dba72",
    violet: "#9b72cf",
    rose: "#f43f5e",
    coral: "#fb7185",
    teal: "#14b8a6",
    sky: "#0ea5e9",
    indigo: "#6366f1",
    fuchsia: "#d946ef",
    pink: "#ec4899",
    emerald: "#10b981",
    orange: "#f97316",
    yellow: "#eab308",
    cyan: "#06b6d4",
};

export function resolveAccentColor(accent: string | null | undefined): string {
    if (accent && accent.startsWith("#")) return accent;
    return ACCENT_MAP[accent ?? "luminous-amber"] ?? ACCENT_MAP["luminous-amber"];
}
