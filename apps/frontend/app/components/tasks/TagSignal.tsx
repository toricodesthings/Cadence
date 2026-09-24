import type { Tag } from "@cadence/contracts/tag";

export function getTagTone(tag?: Tag) {
    if (!tag || !tag.color || tag.color === "default") {
        return {
            backgroundColor: "rgba(255,255,255,0.04)",
            borderColor: "rgba(255,255,255,0.08)",
            color: "var(--color-twilight-text-soft)",
            accentColor: "rgba(201,209,223,0.8)",
        };
    }

    return {
        backgroundColor: `${tag.color}16`,
        borderColor: `${tag.color}33`,
        color: tag.color,
        accentColor: tag.color,
    };
}

/** A row's tags at a glance, as on task cards: one name, or a count with the first colours. */
export function TagSignal({ tags }: { tags: Tag[] }) {
    if (!tags.length) return null;
    const tone = getTagTone(tags[0]);
    return (
        <span
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium"
            style={{ backgroundColor: tone.backgroundColor, borderColor: tone.borderColor, color: tone.color }}
            aria-label={`Tags: ${tags.map((t) => t.name).join(", ")}`}
        >
            <span className="flex items-center gap-1" aria-hidden="true">
                {tags.slice(0, 2).map((tag) => (
                    <span
                        key={tag.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: getTagTone(tag).accentColor }}
                    />
                ))}
            </span>
            <span className="truncate" aria-hidden="true">
                {tags.length === 1 ? tags[0].name : `${tags.length} tags`}
            </span>
        </span>
    );
}
