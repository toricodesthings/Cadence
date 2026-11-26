import { useId, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ChevronRight } from "lucide-react";
import { useDeviceFlag } from "../../hooks/ui/use-device-flag";
import type { LucideIcon } from "lucide-react";
import { BoardCanvas } from "./BoardCanvas";
import { Reveal } from "./Reveal";
import { ScrollAreaWrapper } from "./ScrollAreaWrapper";
import { PageContent } from "../layout/PageLayout";
import { EmptyState, type EmptyStateVariant } from "../tasks/EmptyState";
import { BoardSkeleton, TaskListSkeleton } from "../tasks/TaskListSkeleton";

export interface BucketedCollectionSection {
    key: string;
    title: string;
    icon: LucideIcon;
    accentClass: string;
    count: number;
    description?: ReactNode;
    headerAction?: ReactNode;
    boardHeaderAction?: ReactNode;
    boardDescription?: ReactNode;
    listSectionClassName?: string;
    boardCollapsed?: boolean;
    onBoardExpand?: () => void;
    lineTint?: string;
    listFold?: { open: boolean; toggle: () => void };
    foldedPeek?: ReactNode;
    listContent: ReactNode;
    boardContent: ReactNode;
}

interface BucketedCollectionViewProps {
    sections: BucketedCollectionSection[];
    view: "list" | "kanban";
    fill?: boolean;
}

export function BucketedSectionHeader({
    title,
    icon: Icon,
    accentClass,
    count,
    headerAction,
    lineTint,
    fold,
}: Pick<BucketedCollectionSection, "title" | "icon" | "accentClass" | "count" | "headerAction" | "lineTint"> & {
    fold?: SectionFold;
}) {
    const body = (
        <>
            {fold ? (
                <span className="-mr-1 flex size-11 shrink-0 items-center justify-center text-twilight-text-soft transition-colors group-hover/fold:text-twilight-text">
                    <ChevronRight
                        size={14}
                        aria-hidden="true"
                        className={`transition-transform duration-200 motion-reduce:transition-none ${fold.open ? "rotate-90" : ""}`}
                    />
                </span>
            ) : null}
            <span className="flex items-center gap-2">
                <Icon size={14} className={accentClass} aria-hidden="true" />
                <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-twilight-text">
                    {title}
                </span>
            </span>{" "}
            <span className="text-[12px] tabular-nums text-twilight-text-soft/90">{count}</span>
            <span
                aria-hidden="true"
                className={`h-px flex-1 ${lineTint ? "" : "bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent"}`}
                style={
                    lineTint
                        ? {
                              background: `linear-gradient(to right, color-mix(in srgb, ${lineTint} 30%, transparent), color-mix(in srgb, ${lineTint} 10%, transparent), transparent)`,
                          }
                        : undefined
                }
            />
        </>
    );
    return (
        <div className="flex items-center gap-3">
            <h2 className="flex min-w-0 flex-1">
                {fold ? (
                    <button
                        type="button"
                        onClick={fold.toggle}
                        aria-expanded={fold.open}
                        aria-controls={fold.id}
                        className="group/fold press press-none -my-2 -ml-2 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-full pr-3 text-left transition-colors hover:bg-panel-raised/50 active:bg-panel-raised/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        {body}
                    </button>
                ) : (
                    <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
                )}
            </h2>
            {headerAction}
        </div>
    );
}

export type SectionFold = { open: boolean; toggle: () => void; id: string };

export function useSectionFold(key: string): SectionFold {
    const { pathname } = useLocation();
    const [folded, setFolded] = useDeviceFlag(`cadence-fold:${pathname}:${key}`);
    return { open: !folded, toggle: () => setFolded(!folded), id: useId() };
}

function ListSection({ section }: { section: BucketedCollectionSection }) {
    const own = useSectionFold(section.key);
    const fold = section.listFold ? { ...section.listFold, id: own.id } : own;
    return (
        <section data-section-key={section.key} className={`flex flex-col gap-3 ${section.listSectionClassName ?? ""}`}>
            <BucketedSectionHeader
                title={section.title}
                icon={section.icon}
                accentClass={section.accentClass}
                count={section.count}
                headerAction={section.headerAction}
                lineTint={section.lineTint}
                fold={fold}
            />
            {section.foldedPeek ? <Reveal open={!fold.open}>{section.foldedPeek}</Reveal> : null}
            <Reveal open={fold.open} id={fold.id}>
                <div className="flex flex-col gap-3">
                    {section.description ? (
                        <div className="text-sm leading-relaxed text-twilight-text-soft">{section.description}</div>
                    ) : null}
                    {section.listContent}
                </div>
            </Reveal>
        </section>
    );
}

export function BucketedCollectionView({ sections, view, fill }: BucketedCollectionViewProps) {
    if (view === "list") {
        return (
            <div className="flex flex-col gap-6">
                {sections.map((section) => (
                    <ListSection key={section.key} section={section} />
                ))}
            </div>
        );
    }

    return (
        <BoardCanvas
            fill={fill}
            headerIcons
            columns={sections.map((section) => ({
                id: section.key,
                title: section.title,
                count: section.count,
                icon: <section.icon size={18} className={section.accentClass} aria-hidden="true" />,
                description: section.boardDescription,
                headerAction:
                    section.boardHeaderAction === undefined ? section.headerAction : section.boardHeaderAction,
                content: section.boardContent,
                collapsed: section.boardCollapsed,
                onExpand: section.onBoardExpand,
            }))}
        />
    );
}

export function BucketedRouteBody({
    view,
    sections,
    isLoading,
    isEmpty,
    empty,
    lead,
}: {
    view: "list" | "kanban";
    sections: BucketedCollectionSection[];
    isLoading: boolean;
    isEmpty: boolean;
    empty: EmptyStateVariant;
    lead?: ReactNode;
}) {
    const body = (content: ReactNode) =>
        isLoading ? <TaskListSkeleton /> : isEmpty ? <EmptyState variant={empty} /> : content;
    if (view === "kanban") {
        return (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {isLoading ? (
                    <BoardSkeleton columns={Math.max(2, Math.min(sections.length || 3, 4))} />
                ) : !isEmpty ? (
                    <BucketedCollectionView view={view} sections={sections} />
                ) : (
                    <PageContent width="default">
                        <EmptyState variant={empty} />
                    </PageContent>
                )}
            </div>
        );
    }
    return (
        <ScrollAreaWrapper>
            <PageContent width="default">
                {body(
                    <>
                        {lead}
                        <BucketedCollectionView view={view} sections={sections} />
                    </>,
                )}
            </PageContent>
        </ScrollAreaWrapper>
    );
}
