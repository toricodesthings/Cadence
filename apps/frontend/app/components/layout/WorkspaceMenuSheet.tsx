import { useCaptureFeed } from "../../hooks/inbox/use-capture-feed";
import { useState, type ReactNode } from "react";
import { useMatch, useNavigate } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarRange, Inbox, Plus, Sunrise } from "lucide-react";
import { UtilitySheet } from "../shared/UtilitySheet";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";
import { NAV_GROUP, NAV_GROUP_LABEL, NavigationRow } from "./NavigationRow";
import { PlainNavCount } from "../sidebar/PlainNavCount";
import { TagBubble } from "../sidebar/TagBubble";
import { Button } from "../primitives/Button";
import { Skeleton } from "../primitives/Skeleton";
import { useCreateProject } from "../../hooks/projects/use-create-project";
import { useProjects } from "../../hooks/projects/use-projects";
import { useCreateTag } from "../../hooks/tags/use-create-tag";
import { useTags } from "../../hooks/tags/use-tags";
import { PROJECT_ACCENT_OPTIONS } from "../../lib/constants/colors";
import { Swatches, TAG_SWATCHES } from "../shared/Swatches";
import { resolveAccentColor } from "../../lib/utils/color-resolver";

const INPUT = "min-h-12 w-full min-w-0 flex-1 rounded-2xl border border-twilight-border bg-white/[0.04] px-4 text-base text-twilight-text outline-none placeholder:text-twilight-text-muted/80 focus:border-accent-primary/40";

type View = "menu" | "project" | "tag";

function CreateForm({ onSubmit, disabled, label, children }: { onSubmit: () => void; disabled: boolean; label: string; children: ReactNode }) {
    return (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!disabled) onSubmit(); }}>
            {children}
            <Button type="submit" variant="primary" size="md" disabled={disabled} className="min-h-12 w-full">{label}</Button>
        </form>
    );
}

function SectionHeading({ label, onAdd, addLabel }: { label: string; onAdd: () => void; addLabel: string }) {
    return (
        <div className="flex items-center justify-between gap-2 pr-1">
            <h3 className={NAV_GROUP_LABEL}>{label}</h3>
            <Button variant="ghost" size="icon" onClick={onAdd} aria-label={addLabel}
                className="rounded-full text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text">
                <Plus size={18} aria-hidden="true" />
            </Button>
        </div>
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
    const { count: captureCount } = useCaptureFeed();
    const { data: projects, isLoading: projectsLoading } = useProjects();
    const { data: tags = [] } = useTags();
    const activeTagId = useMatch("/tag/:tagId")?.params.tagId;
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

    const openTag = (tagId: string) => {
        navigate(`/tag/${tagId}`);
        close();
    };

    const forms: Record<Exclude<View, "menu">, ReactNode> = {
        project: (
            <CreateForm label="Create list" disabled={!name.trim()} onSubmit={() => { createProject.mutate({ name: name.trim(), colorAccent: color, emoji }); setView("menu"); }}>
                <div className="flex items-center gap-3">
                    <EmojiPickerPopover emoji={emoji} onSelect={setEmoji} />
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" aria-label="List name" enterKeyHint="done" className={INPUT} />
                </div>
                <Swatches value={color} onChange={setColor} options={PROJECT_ACCENT_OPTIONS.map((o) => ({ value: o.value, color: o.varName, label: o.label }))} />
            </CreateForm>
        ),
        tag: (
            <CreateForm label="Create tag" disabled={!name.trim()} onSubmit={() => { createTag.mutate({ name: name.trim(), color }); setView("menu"); }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tag name" aria-label="Tag name" enterKeyHint="done" className={INPUT} />
                <Swatches value={color} onChange={setColor} options={TAG_SWATCHES} />
            </CreateForm>
        ),
    };

    return (
        <UtilitySheet
            title={view === "project" ? "New list" : view === "tag" ? "New tag" : "Workspace"}
            open={open}
            onClose={close}
            onBack={view === "menu" ? undefined : () => setView("menu")}
            backLabel="Back to workspace"
        >
            {/* Creating swaps the sheet's page instead of stacking a dialog on it. */}
            <motion.div key={view} initial={{ opacity: 0, x: reduceMotion ? 0 : view === "menu" ? -40 : 40 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }} className="space-y-5">
            {view !== "menu" ? forms[view] : <>
            <nav aria-label="Task views" className={NAV_GROUP}>
                <NavigationRow to="/" icon={Inbox} tone="var(--accent-nav-capture, var(--accent-primary))" detail={<PlainNavCount count={captureCount} />} onClick={close}>Capture</NavigationRow>
                <NavigationRow to="/today" icon={Sunrise} tone="var(--accent-nav-today, var(--accent-primary))" onClick={close}>Today</NavigationRow>
                <NavigationRow to="/upcoming" icon={CalendarRange} tone="var(--accent-nav-upcoming, var(--accent-primary))" onClick={close}>Upcoming</NavigationRow>
            </nav>

            <section className="space-y-1.5">
                <SectionHeading label="Lists" onAdd={() => openForm("project")} addLabel="Create list" />
                {projectsLoading ? (
                    <div className={`${NAV_GROUP} flex flex-col gap-3 px-4 py-4`} aria-label="Loading lists">
                        <Skeleton className="h-4 w-3/4 rounded-xl" />
                        <Skeleton className="h-4 w-1/2 rounded-xl" />
                    </div>
                ) : !projects || projects.length === 0 ? (
                    <p className="px-4 text-[13px] leading-relaxed text-twilight-text-soft/90">
                        No lists yet. Create one to organize your tasks.
                    </p>
                ) : (
                    <nav aria-label="Lists" className={NAV_GROUP}>
                        {projects.map((project) => (
                            <NavigationRow
                                key={project.id}
                                to={`/project/${project.id}`}
                                onClick={close}
                                leading={project.emoji
                                    ? <span className="text-[17px] leading-none">{project.emoji}</span>
                                    : <span className="size-2.5 rounded-full" style={{ backgroundColor: resolveAccentColor(project.colorAccent) }} />}
                            >
                                {project.name}
                            </NavigationRow>
                        ))}
                    </nav>
                )}
            </section>

            <section aria-label="Tags" className="space-y-1.5">
                <SectionHeading label="Tags" onAdd={() => openForm("tag")} addLabel="Create tag" />
                {tags.length === 0 ? (
                    <p className="px-4 text-[13px] leading-relaxed text-twilight-text-soft/90">
                        No tags yet. Each tag gets a page of its tasks.
                    </p>
                ) : (
                    <div className={`${NAV_GROUP} flex min-w-0 flex-wrap gap-2 p-3`}>
                        {tags.map((tag) => (
                            <TagBubble
                                key={tag.id}
                                tag={tag}
                                isActive={activeTagId === tag.id}
                                onClick={() => openTag(tag.id)}
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
