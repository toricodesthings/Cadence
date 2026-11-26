import MiniSearch from "minisearch";
import { processTerm, searchTerms } from "./terms";

export interface MethodDocument {
    id: string;
    name: string;
    text: string;
}
export interface MethodHit {
    id: string;
    score: number;
}

const STOPWORDS = new Set(
    (
        "a an the this that these those my me i you your it its to for of on in at by with and or is are was were be do did does " +
        "what which who how when where please can could would should all any some about from into there here then than just another other"
    ).split(" "),
);

export function rankMethods(
    query: string,
    docs: readonly MethodDocument[],
    { synonyms = {} }: { synonyms?: Readonly<Record<string, readonly string[]>> } = {},
): MethodHit[] | null {
    const queryTerms = searchTerms(query).filter((term) => !STOPWORDS.has(term));
    if (!queryTerms.length) return null;

    const expansions = new Map(
        Object.entries(synonyms).map(([word, users]) => [processTerm(word), users.map(processTerm)]),
    );
    const nameStems = (name: string) =>
        searchTerms(name)
            .filter((term) => !STOPWORDS.has(term))
            .map(processTerm);
    const aliasesOf = (name: string) => nameStems(name).flatMap((stem) => expansions.get(stem) ?? []);

    const engine = new MiniSearch<MethodDocument & { alias: string }>({
        fields: ["name", "alias", "text"],
        tokenize: searchTerms,
        processTerm: (term) => (STOPWORDS.has(term) ? null : processTerm(term)),
        searchOptions: {
            combineWith: "OR",
            tokenize: searchTerms,
            processTerm: (term) => (STOPWORDS.has(term) ? null : processTerm(term)),
            boost: { name: 6, alias: 3 },
            prefix: (term, index, terms) => index === terms.length - 1 && term.length >= 3,
        },
    });
    engine.addAll(docs.map((doc) => ({ ...doc, alias: aliasesOf(doc.name).join(" ") })));

    const wanted = queryTerms.map(processTerm);
    const names = new Map(docs.map((doc) => [doc.id, new Set([...nameStems(doc.name), ...aliasesOf(doc.name)])]));
    return engine
        .search(queryTerms.join(" "))
        .map((hit) => {
            const id = String(hit.id);
            const whole = wanted.every((term) => names.get(id)!.has(term));
            return { id, score: Math.round(hit.score * (whole ? 1.5 : 1) * 100) };
        })
        .sort((a, b) => b.score - a.score || a.id.length - b.id.length || a.id.localeCompare(b.id));
}
