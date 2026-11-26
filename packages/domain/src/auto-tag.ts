export function foldName(name: string): string {
    return name
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
}

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
