import { stemmer } from "stemmer";

/** Preserve internal identifier punctuation; remove only surrounding prose punctuation. */
export function searchTerms(text: string): string[] {
    const tokens = text.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}_%+][\p{L}\p{N}_.+%#'-]*/gu) ?? [];
    return [...new Set(tokens.flatMap((token) => {
        const term = token.replace(/^'+|['.]+$/g, "");
        if (/\p{N}/u.test(term) || /^[a-z]+[+#]+$/.test(term) || /^[%_+]$/.test(term)) return [term];
        // Ordinary prose punctuation is a word boundary; identifier punctuation above is literal.
        return term.replace(/'s$/u, "").split(/[^\p{L}]+/u).filter(Boolean);
    }))];
}

/** "v0.31.0" or "0.31.0". Linear: each `.` separates digit runs, so nothing can backtrack. */
export const isVersion = (term: string): boolean => /^v?\d+(?:\.\d+)+$/i.test(term); // nosemgrep

export const isIdentifier = (term: string): boolean => /\p{N}/u.test(term);

export function processTerm(term: string): string {
    // v0.31.0 and 0.31.0 name the same release, but prereleases and extra components don't.
    if (isVersion(term)) return term.replace(/^v/i, "");
    if (!/^[a-z]+$/.test(term)) return term;
    // Porter otherwise merges university/universe and organization/organ.
    // Preserve these derivational families while still matching their ordinary inflections.
    const noun = term.replace(/ities$/, "ity").replace(/isms$/, "ism");
    if (/(?:ity|ism)$/.test(noun)) return noun;
    const verb = /^(.*?)(?:ization(?:s|al|ally)?|ize[sd]?|izing)$/.exec(term);
    return verb ? `${verb[1]}ize` : stemmer(term);
}

/** No approximate matching of short words, versions, numbers, codes or punctuation. */
export const canApproximate = (term: string): boolean => /^[a-z]{5,}$/.test(term);

export function identifierPattern(term: string): string {
    const version = isVersion(term);
    const literal = (version ? term.replace(/^v/i, "") : term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `(^|[^[:alnum:]_.+-])${version ? "v?" : ""}${literal}($|[^[:alnum:]_.+-]|[.]([^[:digit:]]|$))`;
}

/** Course families are explicit alphabetic prefixes, not guessed numeric identities. */
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
