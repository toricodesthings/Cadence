import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BoardCanvas } from "./BoardCanvas";
import { Reveal } from "./Reveal";

export interface BucketedCollectionSection {
    key: string;
    title: string;
    icon: LucideIcon;
    accentClass: string;
    count: number;
    description?: ReactNode;
    headerAction?: ReactNode;
    boardHeaderAction?: ReactNode;
    /** Board column description (list view uses `description`). */
    boardDescription?: ReactNode;
    listSectionClassName?: string;
    boardCollapsed?: boolean;
    /** Collapsed board rail click: show the column again. */
    onBoardExpand?: () => void;
    /** Moonlit-style tint for the header's hairline (a CSS colour). */
    lineTint?: string;
    /** List view: content rides inside the section until `listOpen` is false (animated). */
    listOpen?: boolean;
    listContent: ReactNode;
    boardContent: ReactNode;
}

interface BucketedCollectionViewProps {
    sections: BucketedCollectionSection[];
    view: "list" | "kanban";
    desktopColumnScroll?: boolean;
}

export function BucketedSectionHeader({
    title,
    icon: Icon,
    accentClass,
    count,
    headerAction,
    lineTint,
}: Pick<BucketedCollectionSection, "title" | "icon" | "accentClass" | "count" | "headerAction" | "lineTint">) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
                <Icon size={14} className={accentClass} aria-hidden="true" />
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-twilight-text">
                    {title}
                </h2>
            </div>
            <span className="text-[12px] tabular-nums text-twilight-text-soft/90">{count}</span>
            <div
                className={`h-px flex-1 ${lineTint ? "" : "bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent"}`}
                style={lineTint ? { background: `linear-gradient(to right, color-mix(in srgb, ${lineTint} 30%, transparent), color-mix(in srgb, ${lineTint} 10%, transparent), transparent)` } : undefined}
            />
            {headerAction}
        </div>
    );
}

export function BucketedCollectionView({ sections, view, desktopColumnScroll = false }: BucketedCollectionViewProps) {
    if (view === "list") {
        return (
            <div className="flex flex-col gap-6">
                {sections.map((section) => (
                    <section key={section.key} data-section-key={section.key} className={`flex flex-col gap-3 ${section.listSectionClassName ?? ""}`}>
                        <BucketedSectionHeader title={section.title} icon={section.icon} accentClass={section.accentClass} count={section.count} headerAction={section.headerAction} lineTint={section.lineTint} />
                        {section.description ? (
                            <div className="text-sm leading-relaxed text-twilight-text-soft">
                                {section.description}
                            </div>
                        ) : null}
                        {section.listOpen === undefined ? section.listContent : <Reveal open={section.listOpen}>{section.listContent}</Reveal>}
                    </section>
                ))}
            </div>
        );
    }

    return (
        <BoardCanvas
            desktopColumnScroll={desktopColumnScroll}
            columns={sections.map((section) => ({
                id: section.key,
                title: section.title,
                count: section.count,
                icon: <section.icon size={18} className={section.accentClass} aria-hidden="true" />,
                description: section.boardDescription,
                headerAction: section.boardHeaderAction ?? section.headerAction,
                content: section.boardContent,
                collapsed: section.boardCollapsed,
                onExpand: section.onBoardExpand,
            }))}
        />
    );
}
