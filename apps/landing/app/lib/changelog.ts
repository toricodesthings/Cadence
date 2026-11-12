import type { ChangelogEntry } from "../../../frontend/app/lib/constants/changelog";
import { formatDay } from "~/components/legal/LegalPage";
import type { LegalBlock, LegalDoc } from "~/lib/legal/types";

// Injected at build time from the root CHANGELOG.md (vite.config.ts), newest first, [Unreleased] left out.
declare const __CADENCE_CHANGELOG__: ChangelogEntry[];

const KIND = { added: "Added", changed: "Changed", removed: "Removed", fixed: "Fixed" } as const;

/** "v0.45.3 Beta" → "0.45" */
const lineOf = (e: ChangelogEntry) => e.version.replace(/^v(\d+\.\d+).*/, "$1");

function releaseBlocks(e: ChangelogEntry): LegalBlock[] {
  return [
    { kind: "sub", title: `${e.version.replace(" Beta", "")}${e.date ? ` · ${formatDay(e.date)}` : ""}` },
    { kind: "p", text: `**${e.title}**` },
    ...e.groups.flatMap((g): LegalBlock[] => [
      { kind: "p", text: KIND[g.kind] },
      { kind: "list", items: g.items },
    ]),
  ];
}

/**
 * The changelog as a document for LegalPage: one section per minor line (0.45 holds 0.45.0–0.45.3),
 * titled by the release that opened it, so 120-odd releases read as a few dozen chapters.
 */
export function changelogDoc(entries: ChangelogEntry[] = __CADENCE_CHANGELOG__): LegalDoc {
  const lines = new Map<string, ChangelogEntry[]>();
  for (const e of entries) lines.set(lineOf(e), [...(lines.get(lineOf(e)) ?? []), e]);
  const [latest] = entries;

  return {
    title: "What's new",
    description: "Every Cadence release, newest first: what was added, changed, removed and fixed.",
    lede: "Every release, newest first. Small fixes and big rooms alike, each said once, in plain words.",
    updated: latest?.date ?? "",
    inShort: latest ? latest.groups.flatMap((g) => g.items) : [],
    sections: [...lines].map(([line, releases]) => ({
      id: `v${line.replace(".", "-")}`,
      title: `${line} · ${releases.at(-1)!.title}`,
      blocks: releases.flatMap(releaseBlocks),
    })),
  };
}
