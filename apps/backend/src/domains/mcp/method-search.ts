import { setSearchRanker, type SearchItem } from "@cloudflare/codemode";
import { rankMethods } from "@cadence/search/methods";

/** SDK words → the words people use. Routines are `habit` in code, Lists `project`, Capture `inbox`. */
export const CADENCE_SYNONYMS = {
    habit: ["routine"],
    project: ["list"],
    inbox: ["capture", "idea", "thought"],
    delete: ["remove", "trash", "erase"],
    window: ["week", "range"],
    today: ["overdue"],
    event: ["birthday", "anniversary"],
    create: ["add", "new", "make"],
    update: ["change", "edit", "move", "rename"],
    chats: ["chat", "say", "said", "mention", "told"],
    recall: ["remember", "know"],
    reschedule: ["move", "postpone", "push"],
    get: ["show", "see", "find", "read"],
    fit: ["plan"],
    focus: ["view"],
};

const WANTS_DELETE = /delet|remov|trash|erase|discard/i;

/** Ranks the SDK's methods for Code Mode's `search` and `codemode.search()`; null = the library ranks as before. */
export function cadenceRanker(query: string, items: SearchItem[]) {
    const byPath = new Map(items.map((item) => [item.path, item]));
    const hits = rankMethods(
        query,
        items.map((item) => ({ id: item.path, name: item.method.replaceAll("_", " "), text: item.description ?? "" })),
        { synonyms: CADENCE_SYNONYMS },
    );
    // A plain noun ("birthday") shouldn't surface a destructive method first.
    const calm = (id: string, score: number) =>
        byPath.get(id)!.method.startsWith("delete_") && !WANTS_DELETE.test(query) ? Math.round(score / 2) : score;
    if (!hits) return null;
    return hits
        .map((hit) => ({ ...byPath.get(hit.id)!, score: calm(hit.id, hit.score) }))
        .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));
}

export const installCadenceSearch = () => setSearchRanker(cadenceRanker);
