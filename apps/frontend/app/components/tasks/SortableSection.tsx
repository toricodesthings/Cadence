import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/** Marks a sortable section so a board's card drags can tell it from a card. */
export const SECTION_SORT = "SectionSort";

/** One section's place in a sortable list or board: `children` gets its grip to put in the header. */
export function SortableSection({ id, name, className, children }: {
    /** The section's id as the list knows it. */
    id: string;
    name: string;
    className?: string;
    children: (grip: ReactNode) => ReactNode;
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: `section:${id}`,
        data: { type: SECTION_SORT, sectionId: id },
    });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, position: "relative", zIndex: isDragging ? 10 : undefined };
    const grip = (
        <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            data-no-dnd="true"
            aria-label={`Drag to reorder section ${name}`}
            className="shrink-0 cursor-grab touch-none rounded-lg p-0.5 text-twilight-text-muted opacity-0 transition-opacity hover:text-twilight-text focus-visible:opacity-100 group-hover:opacity-100 touch-reveal"
        >
            <GripVertical size={14} aria-hidden="true" />
        </button>
    );
    return (
        <div ref={setNodeRef} style={style} className={`${className ?? ""} ${isDragging ? "opacity-60" : ""}`.trim()}>
            {children(grip)}
        </div>
    );
}
