/** Auto-tag: a task takes the tag named like its list or section. Matching is a folded exact name, never fuzzy. */

/** "COMPUTER 2000", "computer-2000" and "Computer2000" all fold to `computer2000`. */
export function foldName(name: string): string {
    return name
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Tag ids named like these places (list, section). When tags fold alike, the first in tag order wins. */
export function tagsForPlace(
    placeNames: (string | null | undefined)[],
    tags: { id: string; name: string; sortOrder: number }[],
): string[] {
    const ordered = [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const ids = new Set<string>();
    for (const place of placeNames) {
        const key = place ? foldName(place) : "";
        const tag = key ? ordered.find((t) => foldName(t.name) === key) : undefined;
        if (tag) ids.add(tag.id);
    }
    return [...ids];
}
