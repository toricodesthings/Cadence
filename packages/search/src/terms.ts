import { stemmer } from "stemmer";

export function searchTerms(text: string): string[] {
    const tokens =
        text
            .toLowerCase()
            .normalize("NFC")
            .match(/[\p{L}\p{N}_%+][\p{L}\p{N}_.+%#'-]*/gu) ?? [];
    return [
        ...new Set(
            tokens.flatMap((token) => {
                const term = token.replace(/^'+|['.]+$/g, "");
                if (/\p{N}/u.test(term) || /^[a-z]+[+#]+$/.test(term) || /^[%_+]$/.test(term)) return [term];
                return term
                    .replace(/'s$/u, "")
                    .split(/[^\p{L}]+/u)
                    .filter(Boolean);
            }),
        ),
    ];
}

export const isVersion = (term: string): boolean => /^v?\d+(?:\.\d+)+$/i.test(term);

export const isIdentifier = (term: string): boolean => /\p{N}/u.test(term);

export function processTerm(term: string): string {
    if (isVersion(term)) return term.replace(/^v/i, "");
    if (!/^[a-z]+$/.test(term)) return term;
    const noun = term.replace(/ities$/, "ity").replace(/isms$/, "ism");
    if (/(?:ity|ism)$/.test(noun)) return noun;
    const verb = /^(.*?)(?:ization(?:s|al|ally)?|ize[sd]?|izing)$/.exec(term);
    return verb ? `${verb[1]}ize` : stemmer(term);
}

export const canApproximate = (term: string): boolean => /^[a-z]{5,}$/.test(term);

export function identifierPattern(term: string): string {
    const version = isVersion(term);
    const literal = (version ? term.replace(/^v/i, "") : term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `(^|[^[:alnum:]_.+-])${version ? "v?" : ""}${literal}($|[^[:alnum:]_.+-]|[.]([^[:digit:]]|$))`;
}

export function indexTerms(text: string): string[] {
    return searchTerms(text).flatMap((term) => {
        const family = /^([a-z]{2,})\d+[a-z]*$/.exec(term)?.[1];
        return family ? [term, family] : [term];
    });
}

export function noteHeadings(text: string): string[] {
    return text.split("\n").flatMap((line) => {
        const heading = /^#{1,6}\s+(.+)$/.exec(line.trim())?.[1]?.trim();
        return heading ? [heading] : [];
    });
}
