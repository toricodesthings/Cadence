import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { CalendarRange, Inbox, CheckCircle2, Trash2, LayoutDashboard, Calendar, Flame, Sprout, Search, Plus } from "lucide-react";
import * as ScrollArea from "../primitives/ScrollArea";
import * as Separator from "../primitives/Separator";
import * as Collapsible from "../primitives/Collapsible";
import { NavLink } from "./NavLink";
import { ProjectLink } from "./ProjectLink";
import { CreateProjectPopover } from "./CreateProjectPopover";
import { useProjects } from "../../hooks/projects";
import { useInbox } from "../../hooks/inbox";
import { resolveAccentColor } from "../../lib/utils/color-resolver";
import { Skeleton } from "../primitives/Skeleton";
import { Button } from "../primitives/Button";
import { TagBubble } from "./TagBubble";
import { CreateTagInline } from "./CreateTagInline";
import { useTags } from "../../hooks/tags";
import { useTagFilterStore } from "../../stores/tag-filter-store";
import { useSettings } from "../../hooks/core/use-settings";

/** Main sidebar panel with live projects and inbox count */
export function SidebarPanel({
    showWorkspaceNav = false,
    onSearchOpen,
    onQuickAddOpen,
}: {
    showWorkspaceNav?: boolean;
    onSearchOpen?: () => void;
    onQuickAddOpen?: () => void;
}) {
    const [listsOpen, setListsOpen] = useState(true);
    const { data: projects, isLoading: projectsLoading } = useProjects();
    const { data: inboxItems, isLoading: inboxLoading } = useInbox();
    const { data: tags = [], isLoading: tagsLoading } = useTags();
    const { activeTagId, setActiveTag } = useTagFilterStore();
    const { data: userSettings } = useSettings();
    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => {
        const urlTag = searchParams.get("tag");
        if (urlTag && urlTag !== activeTagId) {
            setActiveTag(urlTag);
        } else if (!urlTag && activeTagId) {
            setActiveTag(null);
        }
    }, [searchParams, activeTagId, setActiveTag]);

    useEffect(() => {
        if (!tagsLoading && activeTagId && !tags.some(t => t.id === activeTagId)) {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("tag");
            setSearchParams(newParams);
        }
    }, [tags, tagsLoading, activeTagId, searchParams, setSearchParams]);

    const handleToggleTag = (tagId: string) => {
        const isDeactivating = activeTagId === tagId;
        const newTagId = isDeactivating ? null : tagId;

        setActiveTag(newTagId);

        const newParams = new URLSearchParams(searchParams);
        if (newTagId) {
            newParams.set("tag", newTagId);
        } else {
            newParams.delete("tag");
        }
        setSearchParams(newParams);
    };

    const [tagsOpen, setTagsOpen] = useState(true);
    const [tagSearch, setTagSearch] = useState("");
    const [showCreateTag, setShowCreateTag] = useState(false);

    const filteredTags = tags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()));

    const inboxCount = inboxLoading ? (
        <Skeleton className="h-4 w-6 rounded-xl bg-white/[0.04]" />
    ) : inboxItems?.length ?? 0;

    return (
        <div
            id="sidebar-panel"
            className="flex h-full w-full shrink-0 flex-col pb-4"
            aria-label="Navigation panel"
        >
            <ScrollArea.Root className="mobile-scroll-region flex-1">
                <ScrollArea.Viewport className="h-full px-3 py-5 scrollbar-thin">
                    {/* Search bar — opens command palette for non-wide shells */}
                    {onSearchOpen && (
                        <>
                            <button
                                onClick={onSearchOpen}
                                className="flex w-full items-center gap-3 rounded-xl border border-twilight-border/50 bg-white/[0.02] px-3.5 py-2.5 text-sm text-twilight-text-muted/60 hover:bg-white/[0.04] hover:border-twilight-border transition-colors cursor-pointer"
                                aria-label="Search workspace"
                            >
                                <Search size={15} className="shrink-0" aria-hidden="true" />
                                <span>Search…</span>
                            </button>
                            <Separator.Root className="h-px bg-twilight-border my-4" aria-hidden="true" />
                        </>
                    )}
                    {/* Primary nav */}
                    {showWorkspaceNav && (
                        <>
                            <nav aria-label="Workspace destinations" className="mb-5 flex flex-col gap-0.5">
                                <NavLink
                                    icon={Calendar}
                                    label="Schedule"
                                    href="/schedule"
                                    activeColor="text-[var(--color-nav-schedule)]"
                                    activeBg="bg-[var(--color-nav-schedule)]/15"
                                    hoverColor="group-hover:text-[var(--color-nav-schedule)]/70"
                                />
                                <NavLink
                                    icon={Flame}
                                    label="Habits"
                                    href="/habits"
                                    activeColor="text-lantern"
                                    activeBg="bg-lantern/15"
                                    hoverColor="group-hover:text-lantern"
                                />
                                <NavLink
                                    icon={Sprout}
                                    label="Weekly Reset"
                                    href="/weekly-review"
                                    activeColor="text-[var(--color-nav-planner)]"
                                    activeBg="bg-[var(--color-nav-planner)]/15"
                                    hoverColor="group-hover:text-[var(--color-nav-planner)]/70"
                                />
                            </nav>

                            <Separator.Root className="h-px bg-twilight-border my-5" aria-hidden="true" />
                        </>
                    )}

                    {/* Primary nav */}
                    <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
                        <NavLink
                            icon={Inbox}
                            label="Holding"
                            href="/"
                            count={inboxCount}
                            activeColor="text-[var(--color-nav-inbox)]"
                            activeBg="bg-[var(--color-nav-inbox)]/15"
                            hoverColor="group-hover:text-[var(--color-nav-inbox)]/70"
                        />
                        <NavLink
                            icon={LayoutDashboard}
                            label="Today"
                            href="/today"
                            activeColor="text-[var(--color-nav-planner)]"
                            activeBg="bg-[var(--color-nav-planner)]/15"
                            hoverColor="group-hover:text-[var(--color-nav-planner)]/70"
                        />
                        <NavLink
                            icon={CalendarRange}
                            label="Upcoming"
                            href="/upcoming"
                            activeColor="text-[var(--color-nav-upcoming)]"
                            activeBg="bg-[var(--color-nav-upcoming)]/15"
                            hoverColor="group-hover:text-[var(--color-nav-upcoming)]/70"
                        />
                    </nav>

                    <Separator.Root className="h-px bg-twilight-border my-5" aria-hidden="true" />

                    {/* Projects */}
                    <Collapsible.Root open={listsOpen} onOpenChange={setListsOpen}>
                        <div className="flex items-center justify-between px-3 mb-2">
                            <Collapsible.Trigger asChild>
                                <button
                                    className="text-[12px] font-semibold text-twilight-text-muted uppercase tracking-[0.12em] hover:text-twilight-text-soft transition-colors cursor-pointer"
                                    aria-expanded={listsOpen}
                                    aria-controls="projects-list"
                                >
                                    Projects
                                </button>
                            </Collapsible.Trigger>
                            <CreateProjectPopover />
                        </div>
                        <Collapsible.Content id="projects-list">
                            {projectsLoading ? (
                                <div className="px-3 py-2 flex flex-col gap-3" aria-label="Loading projects">
                                    <Skeleton className="h-4 w-3/4 rounded-xl" />
                                    <Skeleton className="h-4 w-1/2 rounded-xl" />
                                    <Skeleton className="h-4 w-2/3 rounded-xl" />
                                </div>
                            ) : !projects || projects.length === 0 ? (
                                <p className="px-3 py-3 text-[13px] text-twilight-text-muted/90 leading-relaxed">
                                    No projects yet. Create one to organize your tasks.
                                </p>
                            ) : (
                                <div className="flex flex-col gap-0.5">
                                    {projects.map((project) => (
                                        <ProjectLink
                                            key={project.id}
                                            id={project.id}
                                            label={project.name}
                                            emoji={project.emoji}
                                            color={resolveAccentColor(project.colorAccent)}
                                            href={`/project/${project.id}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </Collapsible.Content>
                    </Collapsible.Root>

                    <Separator.Root className="h-px bg-twilight-border my-5" aria-hidden="true" />

                    {/* Tags */}
                    <Collapsible.Root open={tagsOpen} onOpenChange={setTagsOpen}>
                        <div className="flex items-center justify-between px-3 mb-2">
                            <Collapsible.Trigger asChild>
                                <Button variant="ghost" size="sm" className="text-[12px] font-semibold text-twilight-text-muted uppercase tracking-[0.12em] p-0 h-auto hover:bg-transparent hover:text-twilight-text-soft">
                                    Tags
                                </Button>
                            </Collapsible.Trigger>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowCreateTag(true)}
                                aria-label="Create tag"
                                className="rounded-2xl text-twilight-text-muted hover:bg-white/[0.04] hover:text-twilight-text"
                            >
                                <Plus size={16} />
                            </Button>
                        </div>
                        <Collapsible.Content>
                            {/* Mini search */}
                            {tags.length > 5 && (
                                <div className="px-3 mb-2">
                                    <input
                                        type="text"
                                        value={tagSearch}
                                        onChange={(e) => setTagSearch(e.target.value)}
                                        placeholder="Search tags…"
                                        className="w-full bg-white/[0.04] rounded-lg px-2.5 py-1.5 text-[12px] outline-none placeholder:text-twilight-text-muted/80 border border-transparent focus:border-twilight-border-interactive transition-colors"
                                    />
                                </div>
                            )}
                            {/* Tag bubbles */}
                            <div className="flex flex-wrap gap-1.5 px-3">
                                {filteredTags.map(tag => (
                                    <TagBubble
                                        key={tag.id}
                                        tag={tag}
                                        isActive={activeTagId === tag.id}
                                        onClick={() => handleToggleTag(tag.id)}
                                    />
                                ))}
                            </div>
                            {/* Inline create tag */}
                            {showCreateTag && (
                                <CreateTagInline
                                    onCreated={() => setShowCreateTag(false)}
                                    onCancel={() => setShowCreateTag(false)}
                                />
                            )}
                        </Collapsible.Content>
                    </Collapsible.Root>

                    <Separator.Root className="h-px bg-twilight-border my-5" aria-hidden="true" />

                    {/* Bottom nav */}
                    <nav aria-label="Secondary navigation" className="flex flex-col gap-0.5">
                        {!userSettings?.tasks?.hideCompleted && (
                            <NavLink
                                icon={CheckCircle2}
                                label="Completed"
                                href="/completed"
                                activeColor="text-[var(--color-nav-completed)]"
                                activeBg="bg-[var(--color-nav-completed)]/15"
                                hoverColor="group-hover:text-[var(--color-nav-completed)]/70"
                            />
                        )}
                        {!userSettings?.tasks?.hideTrash && (
                            <NavLink
                                icon={Trash2}
                                label="Trash"
                                href="/trash"
                                activeColor="text-twilight-text-muted"
                                activeBg="bg-white/[0.06]"
                                hoverColor="group-hover:text-twilight-text-soft"
                            />
                        )}
                    </nav>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar orientation="vertical" className="w-1 p-px">
                    <ScrollArea.Thumb className="rounded-full bg-white/8" />
                </ScrollArea.Scrollbar>
            </ScrollArea.Root>
        </div>
    );
}
