import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { BOARD_COLUMN_MIN_WIDTH } from "../shared/BoardCanvas";

export const SECTION_SORT = "SectionSort";

export function FoldColumn({ hidden, children }: { hidden: boolean; children: ReactNode }) {
    return (
        <div
            inert={hidden}
            className={`grid min-h-0 grid-rows-[minmax(0,1fr)] transition-[grid-template-columns,opacity,margin] duration-200 ease-out motion-reduce:transition-none [html[data-motion=reduced]_&]:transition-none ${hidden ? "min-w-0 shrink-0 grid-cols-[0fr] -mr-4 opacity-0" : `${BOARD_COLUMN_MIN_WIDTH} flex-1 grid-cols-[1fr]`}`}
        >
            <div className="h-full min-h-0 min-w-0 overflow-x-clip">{children}</div>
        </div>
    );
}

export function SortableSection({
    id,
    name,
    className,
    children,
}: {
    id: string;
    name: string;
    className?: string;
    children: (grip: ReactNode) => ReactNode;
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: `section:${id}`,
        data: { type: SECTION_SORT, sectionId: id },
    });
    const style: CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 10 : undefined,
    };
    const grip = (
        <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            data-no-dnd="true"
            aria-label={`Drag to reorder section ${name}`}
            className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-twilight-text-muted/40 transition-colors hover:text-twilight-text-soft active:cursor-grabbing"
        >
            <GripVertical size={16} aria-hidden="true" />
        </button>
    );
    return (
        <div ref={setNodeRef} style={style} className={`${className ?? ""} ${isDragging ? "opacity-60" : ""}`.trim()}>
            {children(grip)}
        </div>
    );
}
