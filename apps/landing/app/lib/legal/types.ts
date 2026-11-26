export type LegalBlock =
    | { kind: "p"; text: string }
    | { kind: "sub"; title: string }
    | { kind: "list"; items: readonly string[] }
    | { kind: "table"; head: readonly string[]; rows: readonly (readonly string[])[] }
    | { kind: "gap"; title: string; text: string };

export type LegalSection = {
    id: string;
    title: string;
    blocks: readonly LegalBlock[];
};

export type LegalDoc = {
    title: string;
    description: string;
    lede: string;
    updated: string;
    inShort: readonly string[];
    sections: readonly LegalSection[];
};
