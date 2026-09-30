/**
 * The shape of a legal document (terms.ts, privacy.ts). The page (components/legal/LegalPage.tsx) renders it;
 * nothing here knows about layout. Inline text supports `**bold**`, `` `code` `` and `[label](https://…)` only.
 */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "sub"; title: string }
  | { kind: "list"; items: readonly string[] }
  /** Every row has as many cells as `head`. */
  | { kind: "table"; head: readonly string[]; rows: readonly (readonly string[])[] }
  /** A plain admission: something missing, unfinished, unverified or undecided. Rendered as its own callout. */
  | { kind: "gap"; title: string; text: string };

export type LegalSection = {
  /** URL fragment and table-of-contents key: lowercase-kebab. */
  id: string;
  title: string;
  blocks: readonly LegalBlock[];
};

export type LegalDoc = {
  title: string;
  /** The page's one-sentence meta description. */
  description: string;
  /** The line under the title, in the page's voice. */
  lede: string;
  /** ISO date (YYYY-MM-DD) the text was last reviewed against the app. */
  updated: string;
  /** "In short": 3–6 one-line plain-language promises or facts, each true of the app today. */
  inShort: readonly string[];
  sections: readonly LegalSection[];
};
