import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BoardCanvas } from "./BoardCanvas";

export interface BucketedCollectionSection {
    key: string;
    title: string;
    icon: LucideIcon;
    accentClass: string;
    count: number;
    description?: ReactNode;
    headerAction?: ReactNode;
    listSectionClassName?: string;
    boardSectionClassName?: string;
    listContent: ReactNode;
    boardContent: ReactNode;
}

interface BucketedCollectionViewProps {
    sections: BucketedCollectionSection[];
    view: "list" | "kanban";
}

function BucketedSectionHeader({
    title,
    icon: Icon,
    accentClass,
    count,
    headerAction,
}: Pick<BucketedCollectionSection, "title" | "icon" | "accentClass" | "count" | "headerAction">) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
                <Icon size={14} className={accentClass} aria-hidden="true" />
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                    {title}
                </h2>
            </div>
            <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{count}</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
            {headerAction}
        </div>
    );
}

export function BucketedCollectionView({ sections, view }: BucketedCollectionViewProps) {
    if (view === "list") {
        return (
            <div className="flex flex-col gap-6">
                {sections.map((section) => (
                    <section key={section.key} className={`flex flex-col gap-3 ${section.listSectionClassName ?? ""}`}>
                        <BucketedSectionHeader {...section} />
                        {section.description ? (
                            <div className="text-sm leading-relaxed text-twilight-text-soft">
                                {section.description}
                            </div>
                        ) : null}
                        {section.listContent}
                    </section>
                ))}
            </div>
        );
    }

    return (
        <BoardCanvas
            columns={sections.map((section) => ({
                id: section.key,
                title: section.title,
                count: section.count,
                description: section.description,
                headerAction: section.headerAction,
                content: section.boardContent,
            }))}
        />
    );
}
