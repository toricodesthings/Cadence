import { createSearchIndex } from "@cadence/search";
import { suggestApps } from "@cadence/nlp/app-suggestions";
import { CATEGORY_LABEL, type AppEntry } from "./catalog";

/** One heading's rows. Headings are omitted when there is nothing to say; every app appears exactly once. */
export interface AppPickerSection {
    key: string;
    heading?: string;
    apps: AppEntry[];
}

const norm = (text: string) => text.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
const byLabel = (a: AppEntry, b: AppEntry) => a.label.localeCompare(b.label);
const names = (entry: AppEntry) => [entry.label, ...entry.aliases].map(norm);

/**
 * Title-based order for one picker visit: the apps the title points at (never selected), computed once
 * when the picker opens so a title edit can't move a row under a finger.
 */
export function suggestForTitle(title: string, available: readonly AppEntry[]): { ids: string[]; heading?: string } {
    const hit = suggestApps(title, available.map((entry) => ({ id: entry.id, category: entry.category, names: names(entry) })));
    if (!hit) return { ids: [] };
    return { ids: hit.ids, heading: hit.basis === "category" && hit.category ? `For ${CATEGORY_LABEL[hit.category].heading}` : undefined };
}

/** The list with no query: current choice first, then the title's suggestions, then the rest A→Z. */
export function pickerSections(available: readonly AppEntry[], currentId: string | null | undefined, suggested: { ids: string[]; heading?: string }, kind: "task" | "routine"): AppPickerSection[] {
    const sorted = [...available].sort(byLabel);
    const current = sorted.find((entry) => entry.id === currentId);
    const taken = new Set<string>(current ? [current.id] : []);
    const picks = suggested.ids.map((id) => sorted.find((entry) => entry.id === id)).filter((entry): entry is AppEntry => Boolean(entry) && !taken.has(entry!.id));
    picks.forEach((entry) => taken.add(entry.id));
    const rest = sorted.filter((entry) => !taken.has(entry.id));
    const sections: AppPickerSection[] = [];
    if (current) sections.push({ key: "current", apps: [current] });
    if (picks.length) sections.push({ key: "suggested", heading: suggested.heading ?? `For this ${kind}`, apps: picks });
    if (rest.length) sections.push({ key: "rest", heading: picks.length || current ? "Other apps" : undefined, apps: rest });
    return sections;
}

/**
 * Searches the supported catalogue: exact name or alias, then name prefix, then purpose words, and spelling
 * guesses only when nothing stricter matched. One or two letters match name prefixes only.
 */
export function createAppSearch(available: readonly AppEntry[]) {
    const index = createSearchIndex(available.map((entry) => ({
        id: entry.id,
        title: entry.label,
        tags: entry.aliases.join(" "),
        notes: [CATEGORY_LABEL[entry.category].purpose, ...entry.terms].join(" "),
    })));
    const byId = new Map<string, AppEntry>(available.map((entry) => [entry.id, entry]));
    return (query: string): AppEntry[] => {
        const q = norm(query);
        if (!q) return [];
        const tier = (entry: AppEntry) => {
            const all = names(entry);
            if (all.includes(q)) return 0;
            if (all.some((name) => name.startsWith(q) || name.split(" ").some((part) => part.startsWith(q)))) return 1;
            return 2;
        };
        const prefixed = available.filter((entry) => tier(entry) < 2);
        if (q.length <= 2) return prefixed.sort((a, b) => tier(a) - tier(b) || byLabel(a, b));
        const strict = index.search(q, { prefix: true }).map((hit) => byId.get(hit.id)).filter((entry): entry is AppEntry => Boolean(entry));
        const merged = new Map([...prefixed, ...strict].map((entry) => [entry.id, entry]));
        const hits = [...merged.values()];
        if (hits.length) return hits.sort((a, b) => tier(a) - tier(b) || byLabel(a, b));
        return index.search(q, { fuzzy: true }).map((hit) => byId.get(hit.id)).filter((entry): entry is AppEntry => Boolean(entry));
    };
}
