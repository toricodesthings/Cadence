import MiniSearch from "minisearch";
import { canApproximate, indexTerms, isVersion, processTerm, searchTerms } from "./terms";

/** Pure searchable data; apps own loading, permissions, routes and display wording. */
export interface SearchDocument {
    id: string;
    title: string;
    list?: string;
    section?: string;
    notes?: string;
    subtasks?: string;
    tags?: string;
}
export type SearchField = Exclude<keyof SearchDocument, "id">;
export interface SearchHit {
    id: string;
    score: number;
    approximate: boolean;
    fields: SearchField[];
}
const FIELDS: SearchField[] = ["title", "list", "section", "notes", "subtasks", "tags"];

/** Construct when documents change, reuse across keystrokes. Every query term is required. */
export function createSearchIndex(documents: readonly SearchDocument[]) {
    const engine = new MiniSearch<SearchDocument>({
        fields: FIELDS,
        tokenize: indexTerms,
        // Keep originals alongside word forms so a typo in an inflected word remains one edit.
        processTerm: (term) => [...new Set([term, processTerm(term)])],
        searchOptions: {
            combineWith: "AND",
            tokenize: searchTerms,
            processTerm,
            boost: { title: 8, list: 3, section: 3, subtasks: 2, tags: 2, notes: 1 },
        },
    });
    engine.addAll(documents);
    const titles = new Map(documents.map((doc) => [doc.id, doc.title.toLowerCase().trim()]));
    return {
        search(query: string, { prefix = false, fuzzy = false }: { prefix?: boolean; fuzzy?: boolean } = {}): SearchHit[] {
            const terms = searchTerms(query);
            if (!terms.length) return [];
            const exact = engine.search(query);
            const strict = new Set(exact.map((hit) => String(hit.id)));
            const options = {
                prefix: (term: string, index: number) => prefix && index === terms.length - 1 && /^[a-z]{3,}$/.test(term),
                fuzzy: (term: string) => fuzzy && canApproximate(term) ? 1 : false,
            };
            const expanded = prefix || fuzzy ? [
                ...engine.search(query, options),
                ...engine.search(query, {
                    ...options,
                    processTerm: (term) => isVersion(term) ? processTerm(term) : term,
                }),
            ] : [];
            const merged = new Map([...expanded, ...exact].map((hit) => [String(hit.id), hit]));
            return [...merged.values()].map((hit) => {
                const id = String(hit.id);
                const approximate = !strict.has(id);
                const titleExact = titles.get(id) === query.toLowerCase().trim();
                return {
                    id,
                    approximate,
                    // Exact terms always outrank spelling guesses, even in a longer title.
                    score: (approximate ? 0 : 1000) + (titleExact ? 500 : 0) + 100 * hit.score / (1 + hit.score),
                    fields: [...new Set(Object.values(hit.match).flat())] as SearchField[],
                };
            }).sort((a, b) => Number(a.approximate) - Number(b.approximate) || b.score - a.score || a.id.localeCompare(b.id));
        },
    };
}
