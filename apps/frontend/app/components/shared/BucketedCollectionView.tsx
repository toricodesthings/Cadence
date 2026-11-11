import { useId, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ChevronRight } from "lucide-react";
import { Tip } from "../primitives/Tooltip";
import { useDeviceFlag } from "../../hooks/ui/use-device-flag";
import type { LucideIcon } from "lucide-react";
import { BoardCanvas } from "./BoardCanvas";
import { Reveal } from "./Reveal";
import { ScrollAreaWrapper } from "./ScrollAreaWrapper";
import { PageContent } from "../layout/PageLayout";
import { EmptyState, type EmptyStateVariant } from "../tasks/EmptyState";
import { TaskListSkeleton } from "../tasks/TaskListSkeleton";

export interface BucketedCollectionSection {
    key: string;
    title: string;
    icon: LucideIcon;
    accentClass: string;
    count: number;
    description?: ReactNode;
    headerAction?: ReactNode;
    /** Board view's header action; unset falls back to `headerAction`, `null` shows none. */
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
    /** List view: false for a section that already folds itself (Further out); others get the shared ›. */
    foldable?: boolean;
    listContent: ReactNode;
    boardContent: ReactNode;
}

interface BucketedCollectionViewProps {
    sections: BucketedCollectionSection[];
    view: "list" | "kanban";
    /** Board columns share the width evenly. */
    fill?: boolean;
    /** Board column titles lead with their icon. */
    headerIcons?: boolean;
}

export function BucketedSectionHeader({
    title,
    icon: Icon,
    accentClass,
    count,
    headerAction,
    lineTint,
    fold,
}: Pick<BucketedCollectionSection, "title" | "icon" | "accentClass" | "count" | "headerAction" | "lineTint"> & { fold?: SectionFold }) {
    return (
        <div className="flex items-center gap-3">
            {fold ? <FoldButton fold={fold} title={title} /> : null}
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

/** A row section's minimise/expand state; `id` names the region it hides. */
export type SectionFold = { open: boolean; toggle: () => void; id: string };

/** Folds a row section, remembered on this device per page and section (`key` must be stable). */
export function useSectionFold(key: string): SectionFold {
    const { pathname } = useLocation();
    const [folded, setFolded] = useDeviceFlag(`cadence-fold:${pathname}:${key}`);
    return { open: !folded, toggle: () => setFolded(!folded), id: useId() };
}

/** The › before a section's title: points down while open; its tooltip says what a tap does. */
export function FoldButton({ fold, title }: { fold: SectionFold; title: string }) {
    const label = fold.open ? "Collapse" : "Expand";
    return (
        <Tip label={label}>
            <button
                type="button"
                onClick={fold.toggle}
                aria-expanded={fold.open}
                aria-controls={fold.id}
                aria-label={`${label} ${title}`}
                className="glass-none -my-2 -ml-2 -mr-1 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-twilight-text-soft transition-colors hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                <ChevronRight size={14} aria-hidden="true" className={`transition-transform duration-200 motion-reduce:transition-none ${fold.open ? "rotate-90" : ""}`} />
            </button>
        </Tip>
    );
}

/** One list-view section with its own fold. */
function ListSection({ section }: { section: BucketedCollectionSection }) {
    const fold = useSectionFold(section.key);
    return (
        <section data-section-key={section.key} className={`flex flex-col gap-3 ${section.listSectionClassName ?? ""}`}>
            <BucketedSectionHeader title={section.title} icon={section.icon} accentClass={section.accentClass} count={section.count} headerAction={section.headerAction} lineTint={section.lineTint} fold={section.foldable === false ? undefined : fold} />
            <Reveal open={section.foldable === false || fold.open} id={fold.id}>
                <div className="flex flex-col gap-3">
                    {section.description ? (
                        <div className="text-sm leading-relaxed text-twilight-text-soft">
                            {section.description}
                        </div>
                    ) : null}
                    {section.listOpen === undefined ? section.listContent : <Reveal open={section.listOpen}>{section.listContent}</Reveal>}
                </div>
            </Reveal>
        </section>
    );
}

export function BucketedCollectionView({ sections, view, fill, headerIcons }: BucketedCollectionViewProps) {
    if (view === "list") {
        return (
            <div className="flex flex-col gap-6">
                {sections.map((section) => <ListSection key={section.key} section={section} />)}
            </div>
        );
    }

    return (
        <BoardCanvas
            fill={fill}
            headerIcons={headerIcons}
            columns={sections.map((section) => ({
                id: section.key,
                title: section.title,
                count: section.count,
                icon: <section.icon size={18} className={section.accentClass} aria-hidden="true" />,
                description: section.boardDescription,
                headerAction: section.boardHeaderAction === undefined ? section.headerAction : section.boardHeaderAction,
                content: section.boardContent,
                collapsed: section.boardCollapsed,
                onExpand: section.onBoardExpand,
            }))}
        />
    );
}

/** A bucketed task route's body: a board that scrolls by column, or a scrolling list (`lead` above it); skeleton while loading, `empty` when nothing shows. */
export function BucketedRouteBody({ view, sections, isLoading, isEmpty, empty, lead }: {
    view: "list" | "kanban";
    sections: BucketedCollectionSection[];
    isLoading: boolean;
    isEmpty: boolean;
    empty: EmptyStateVariant;
    lead?: ReactNode;
}) {
    const body = (content: ReactNode) => (isLoading ? <TaskListSkeleton /> : isEmpty ? <EmptyState variant={empty} /> : content);
    if (view === "kanban") {
        return (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {!isLoading && !isEmpty ? <BucketedCollectionView view={view} sections={sections} /> : <PageContent width="default">{body(null)}</PageContent>}
            </div>
        );
    }
    return (
        <ScrollAreaWrapper>
            <PageContent width="default">
                {body(<>{lead}<BucketedCollectionView view={view} sections={sections} /></>)}
            </PageContent>
        </ScrollAreaWrapper>
    );
}
