import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarRange, Check, LayoutDashboard, Plus } from "lucide-react";
import { UtilitySheet } from "../shared/UtilitySheet";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";
import { NavigationRow } from "./NavigationRow";
import { ProjectLink } from "../sidebar/ProjectLink";
import { TagBubble } from "../sidebar/TagBubble";
import { Button } from "../primitives/Button";
import { Skeleton } from "../primitives/Skeleton";
import { useCreateProject, useProjects } from "../../hooks/projects";
import { useCreateTag, useTags } from "../../hooks/tags";
import { PROJECT_ACCENT_OPTIONS, TAG_PALETTE } from "../../lib/constants/colors";
import { useTagFilterStore } from "../../stores/tag-filter-store";
import { resolveAccentColor } from "../../lib/utils/color-resolver";

const GROUP = "rounded-2xl border border-twilight-border bg-twilight-surface/40";
const SECTION_LABEL = "text-[12px] font-semibold uppercase tracking-[0.12em] text-twilight-text-muted";
const INPUT = "min-h-12 w-full min-w-0 flex-1 rounded-2xl border border-twilight-border bg-white/[0.04] px-4 text-base text-twilight-text outline-none placeholder:text-twilight-text-muted/80 focus:border-accent-primary/40";

type View = "menu" | "project" | "tag";

/** Colour swatches sized for a thumb — shared by the project and tag forms. */
function Swatches({ options, value, onChange }: { options: Array<{ value: string; color: string; label: string }>; value: string; onChange: (value: string) => void }) {
    return (
        <div role="radiogroup" aria-label="Colour" className="grid grid-cols-8 gap-2">
            {options.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.label} onClick={() => onChange(o.value)}
                    className="flex aspect-square items-center justify-center rounded-full transition-transform active:scale-95"
                    style={{ backgroundColor: o.color }}>
                    {value === o.value ? <Check size={16} className="text-midnight" aria-hidden="true" /> : null}
                </button>
            ))}
        </div>
    );
}

function CreateForm({ onSubmit, disabled, label, children }: { onSubmit: () => void; disabled: boolean; label: string; children: ReactNode }) {
    return (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!disabled) onSubmit(); }}>
            {children}
            <Button type="submit" variant="primary" size="md" disabled={disabled} className="min-h-12 w-full">{label}</Button>
        </form>
    );
}

/**
 * Capture's workspace menu (§4.5). Compact shells have no sidebar, so the
 * places you *filter* work from — Today, Upcoming, Projects, Tags — live behind
 * a leading menu control on Capture instead of being scattered into Browse,
 * which keeps the settings-shaped destinations.
 */
export function WorkspaceMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { data: projects, isLoading: projectsLoading } = useProjects();
    const { data: tags = [] } = useTags();
    const { activeTagId, setActiveTag } = useTagFilterStore();
    const [view, setView] = useState<View>("menu");
    const reduceMotion = useReducedMotion();
    const createProject = useCreateProject();
    const createTag = useCreateTag();
    const [name, setName] = useState("");
    const [emoji, setEmoji] = useState("");
    const [color, setColor] = useState("");

    const openForm = (next: Exclude<View, "menu">) => {
        setName("");
        setEmoji("");
        setColor(next === "project" ? "luminous-amber" : "default");
        setView(next);
    };
    const close = () => { setView("menu"); onClose(); };

    const handleToggleTag = (tagId: string) => {
        const nextTagId = activeTagId === tagId ? null : tagId;
        setActiveTag(nextTagId);

        const next = new URLSearchParams(searchParams);
        if (nextTagId) next.set("tag", nextTagId);
        else next.delete("tag");
        navigate(next.size ? `/?${next}` : "/", { preventScrollReset: true });
        close();
    };

    const forms: Record<Exclude<View, "menu">, ReactNode> = {
        project: (
            <CreateForm label="Create project" disabled={!name.trim()} onSubmit={() => { createProject.mutate({ name: name.trim(), colorAccent: color, emoji }); setView("menu"); }}>
                <div className="flex items-center gap-3">
                    <EmojiPickerPopover emoji={emoji} onSelect={setEmoji} />
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" aria-label="Project name" enterKeyHint="done" className={INPUT} />
                </div>
                <Swatches value={color} onChange={setColor} options={PROJECT_ACCENT_OPTIONS.map((o) => ({ value: o.value, color: o.varName, label: o.label }))} />
            </CreateForm>
        ),
        tag: (
            <CreateForm label="Create tag" disabled={!name.trim()} onSubmit={() => { createTag.mutate({ name: name.trim(), color }); setView("menu"); }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tag name" aria-label="Tag name" enterKeyHint="done" className={INPUT} />
                <Swatches value={color} onChange={setColor} options={TAG_PALETTE.map((c) => ({ value: c, color: c === "default" ? "var(--color-twilight-text-muted)" : c, label: c === "default" ? "Default" : c }))} />
            </CreateForm>
        ),
    };

    return (
        <UtilitySheet
            title={view === "project" ? "New project" : view === "tag" ? "New tag" : "Workspace"}
            open={open}
            onClose={close}
            onBack={view === "menu" ? undefined : () => setView("menu")}
            backLabel="Back to workspace"
        >
            {/* Creating swaps the sheet's page instead of stacking a dialog on it. */}
            <motion.div key={view} initial={{ opacity: 0, x: reduceMotion ? 0 : view === "menu" ? -40 : 40 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }} className="space-y-5">
            {view !== "menu" ? forms[view] : <>
            <nav aria-label="Task views" className={GROUP}>
                <NavigationRow to="/today" icon={LayoutDashboard} onClick={close}>Today</NavigationRow>
                <NavigationRow to="/upcoming" icon={CalendarRange} onClick={close}>Upcoming</NavigationRow>
            </nav>

            <section aria-label="Projects" className={`${GROUP} px-3 py-3`}>
                <div className="mb-1 flex items-center justify-between gap-2 px-1">
                    <h3 className={SECTION_LABEL}>Projects</h3>
                    <Button variant="ghost" size="icon" onClick={() => openForm("project")} aria-label="Create project"
                        className="rounded-2xl text-twilight-text-muted hover:bg-white/[0.04] hover:text-twilight-text">
                        <Plus size={16} aria-hidden="true" />
                    </Button>
                </div>
                {projectsLoading ? (
                    <div className="flex flex-col gap-3 px-1 py-2" aria-label="Loading projects">
                        <Skeleton className="h-4 w-3/4 rounded-xl" />
                        <Skeleton className="h-4 w-1/2 rounded-xl" />
                    </div>
                ) : !projects || projects.length === 0 ? (
                    <p className="px-1 py-2 text-[13px] leading-relaxed text-twilight-text-muted/90">
                        No projects yet. Create one to organize your tasks.
                    </p>
                ) : (
                    <div className="flex flex-col gap-0.5" onClick={close}>
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
            </section>

            <section aria-label="Tags" className={`${GROUP} px-3 py-3`}>
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <h3 className={SECTION_LABEL}>Tags</h3>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openForm("tag")}
                        aria-label="Create tag"
                        className="rounded-2xl text-twilight-text-muted hover:bg-white/[0.04] hover:text-twilight-text"
                    >
                        <Plus size={16} aria-hidden="true" />
                    </Button>
                </div>
                {tags.length === 0 ? (
                    <p className="px-1 pb-1 text-[13px] leading-relaxed text-twilight-text-muted/90">
                        No tags yet. Tags filter your capture feed.
                    </p>
                ) : (
                    <div className="flex min-w-0 flex-wrap gap-2 px-1">
                        {tags.map((tag) => (
                            <TagBubble
                                key={tag.id}
                                tag={tag}
                                isActive={activeTagId === tag.id}
                                onClick={() => handleToggleTag(tag.id)}
                            />
                        ))}
                    </div>
                )}
            </section>
            </>}
            </motion.div>
        </UtilitySheet>
    );
}
