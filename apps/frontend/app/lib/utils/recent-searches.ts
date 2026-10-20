/** Phone search's recent queries, on this device only. Settings › Data's "Store recent searches" gates them. */
const RECENT_KEY = "cadence-recent-searches";
const RECENT_LIMIT = 6;

export function readRecentSearches(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
    } catch {
        return [];
    }
}

export function pushRecentSearch(query: string): string[] {
    const trimmed = query.trim();
    if (!trimmed) return readRecentSearches();
    const next = [trimmed, ...readRecentSearches().filter((q) => q.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENT_LIMIT);
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        /* noop — recents are a nicety, not load-bearing */
    }
    return next;
}

export function clearRecentSearches() {
    try {
        localStorage.removeItem(RECENT_KEY);
    } catch {
        /* noop */
    }
}
