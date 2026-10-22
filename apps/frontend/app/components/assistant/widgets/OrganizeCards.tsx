/**
 * Cards for organizing writes: `update_project`/`delete_project`,
 * `update_tag`/`delete_tag`, and the saved focus view writes.
 */
import { Check, Filter, FolderPen, Tag as TagIcon } from "lucide-react";
import { IdentityBlock, TagPill } from "./ProposalCard";
import { ApprovalCard, DeleteApprovalCard, type RetiredRenderContext, type ToolRenderContext } from "./ApprovalCard";
import { useTagsLookup } from "./card-lookups";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useProjects } from "../../../hooks/projects/use-projects";
import { useFocusViews } from "../../../hooks/core/use-focus-views";
import { PRIORITY_OPTIONS, EFFORT_OPTIONS } from "../../tasks/task-choice-options";

function useProjectName() {
    const { data } = useProjects();
    return (id?: string) => data?.find((project) => project.id === id)?.name;
}

type ProjectPatch = { name?: string; emoji?: string | null; colorAccent?: string };

/** "Renamed from “Old” · New emoji · Colour: sage" */
function projectChanges(patch: ProjectPatch, current: string) {
    const emoji = patch.emoji === null ? "No emoji" : patch.emoji ? "New emoji" : null;
    return [
        patch.name && patch.name !== current ? `Renamed from “${current}”` : null,
        emoji,
        patch.colorAccent ? `Colour: ${patch.colorAccent}` : null,
    ].filter(Boolean).join(" · ");
}

/** The list's name after the change, its title with the emoji, and what changes. */
function projectCardText(patch: ProjectPatch, current: string) {
    const name = patch.name ?? current;
    const emoji = patch.emoji ? `${patch.emoji} ` : "";
    return { name, title: `${emoji}${name}`, changes: projectChanges(patch, current) || undefined };
}

export function UpdateProjectCard({ ctx }: { ctx: ToolRenderContext<"update_project"> }) {
    const projectName = useProjectName();
    const input = ctx.part?.input ?? {};
    const current = projectName(input.projectId) ?? ctx.part?.output?.name ?? "this list";
    const { name, title, changes } = projectCardText(input.patch ?? {}, current);
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHANGE LIST"
            eyebrowGlyph={FolderPen}
            ariaLabel={`Change list: ${name}`}
            primaryLabel="Save"
            primaryGlyph={Check}
            doneText={`Updated “${name}”.`}
        >
            <IdentityBlock title={title} subtitle={changes} />
        </ApprovalCard>
    );
}

/** `delete_project` is permanent; what happens to its tasks is on the card. Auto still waits for this tap. */
export function DeleteProjectCard({ ctx }: { ctx: ToolRenderContext<"delete_project"> }) {
    const input = ctx.part?.input ?? {};
    const output = ctx.part?.output;
    const name: string = input.name ?? output?.deleted ?? "this list";
    const trash = input.tasks === "trash";
    const done = [
        `Deleted “${name}”.`,
        output?.tasksTrashed ? `${output.tasksTrashed} open tasks moved to Trash.` : null,
        output?.tasksUnlisted ? `${output.tasksUnlisted} tasks kept with no list.` : null,
    ].filter(Boolean).join(" ");
    return (
        <DeleteApprovalCard
            ctx={ctx}
            eyebrow="DELETE LIST"
            ariaLabel={`Delete list: ${name}`}
            primaryLabel="Delete list"
            doneText={done}
        >
            <IdentityBlock title={name} tone="danger" />
            <p className="text-xs text-twilight-text-soft">
                {trash ? "Its sections go too; its open tasks move to Trash (restorable)." : "Its sections go too; its tasks stay, with no list."}
            </p>
        </DeleteApprovalCard>
    );
}

type TagPatch = { name?: string; color?: string };

/** "Renamed from #old · Colour: sage" */
function tagChanges(patch: TagPatch, current: { name: string } | undefined) {
    return [
        patch.name && current && patch.name !== current.name ? `Renamed from #${current.name}` : null,
        patch.color ? `Colour: ${patch.color}` : null,
    ].filter(Boolean).join(" · ") || undefined;
}

function tagCardName(patch: TagPatch, current: { name: string } | undefined, saved: string | undefined) {
    return patch.name ?? current?.name ?? saved ?? "this tag";
}

export function UpdateTagCard({ ctx }: { ctx: ToolRenderContext<"update_tag"> }) {
    const lookupTags = useTagsLookup();
    const input = ctx.part?.input ?? {};
    const [current] = lookupTags(input.tagId ? [input.tagId] : []);
    const patch: TagPatch = input.patch ?? {};
    const name = tagCardName(patch, current, ctx.part?.output?.name);
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHANGE TAG"
            eyebrowGlyph={TagIcon}
            ariaLabel={`Change tag: ${name}`}
            primaryLabel="Save"
            primaryGlyph={Check}
            doneText={`Updated #${name}.`}
        >
            <IdentityBlock title={`#${name}`} subtitle={tagChanges(patch, current)} />
            {current ? <div className="flex"><TagPill tag={{ ...current, name, color: patch.color ?? current.color }} /></div> : null}
        </ApprovalCard>
    );
}

/** `delete_tag` is permanent; tasks and routines keep everything but the tag. Auto still waits for this tap. */
export function DeleteTagCard({ ctx }: { ctx: ToolRenderContext<"delete_tag"> }) {
    const persona = useAssistantPersona();
    const name: string = ctx.part?.input?.name ?? ctx.part?.output?.deleted ?? "this tag";
    return (
        <DeleteApprovalCard
            ctx={ctx}
            eyebrow="DELETE TAG"
            ariaLabel={`Delete tag: ${name}`}
            doneText={`Deleted #${name}.`}
        >
            <IdentityBlock title={`#${name}`} tone="danger" />
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">It comes off every task and routine; they stay.</p>}
        </DeleteApprovalCard>
    );
}

type ViewFilters = {
    states?: string[];
    projectIds?: string[];
    tagIds?: string[];
    needsDate?: boolean;
    needsProject?: boolean;
    priorityMin?: number | null;
    effortMin?: number | null;
    effortMax?: number | null;
    durationMaxMinutes?: number | null;
    dueWindow?: string | null;
    waitingOnly?: boolean;
    missingStructureOnly?: boolean;
    sortMode?: string;
};

const DUE_COPY: Record<string, string> = { overdue: "Overdue", today: "Due by today", this_week: "Due this week", this_month: "Due this month" };
const STATE_COPY: Record<string, string> = { ACTIVE: "Open", WAITING: "Waiting", COMPLETE: "Done", ARCHIVED: "Trash" };

/** An option's label ("High"), or the raw value when it has none. */
const labelOf = (options: readonly { value: number; label: string }[], value: number) =>
    options.find((o) => o.value === value)?.label ?? value;

/** The filters with a value of their own: priority, effort, time, due window, flags and sort. */
function valueFilterParts(filters: ViewFilters) {
    return [
        filters.needsDate ? "No date" : null,
        filters.needsProject ? "No list" : null,
        filters.priorityMin ? `${labelOf(PRIORITY_OPTIONS, filters.priorityMin)}+ priority` : null,
        filters.effortMin ? `${labelOf(EFFORT_OPTIONS, filters.effortMin)} effort or more` : null,
        filters.effortMax ? `${labelOf(EFFORT_OPTIONS, filters.effortMax)} effort or less` : null,
        filters.durationMaxMinutes ? `${filters.durationMaxMinutes} min or less` : null,
        filters.dueWindow ? DUE_COPY[filters.dueWindow] ?? filters.dueWindow : null,
        filters.waitingOnly ? "Waiting only" : null,
        filters.missingStructureOnly ? "Missing a date or list" : null,
        filters.sortMode ? `Sort: ${filters.sortMode}` : null,
    ];
}

/** "Client · High+ · Low effort · Due this week", from the filters a view sets. */
function useFilterSummary(filters: ViewFilters = {}) {
    const projectName = useProjectName();
    const lookupTags = useTagsLookup();
    return [
        filters.states?.length ? filters.states.map((state) => STATE_COPY[state] ?? state).join(" + ") : null,
        ...(filters.projectIds ?? []).map((id) => projectName(id) ?? "a list"),
        ...lookupTags(filters.tagIds ?? []).map((tag) => `#${tag.name}`),
        ...valueFilterParts(filters),
    ].filter(Boolean).join(" · ") || undefined;
}

export function CreateFocusViewCard({ ctx }: { ctx: ToolRenderContext<"save_focus_view"> | RetiredRenderContext }) {
    const input = ctx.part?.input ?? {};
    const name: string = input.name ?? "this view";
    const summary = useFilterSummary(input.filters);
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow={input.pinned ? "NEW FOCUS VIEW · PINNED" : "NEW FOCUS VIEW"}
            eyebrowGlyph={Filter}
            ariaLabel={`New focus view: ${name}`}
            primaryLabel="Save view"
            primaryGlyph={Check}
            doneText={`Saved the “${name}” view.`}
        >
            <IdentityBlock title={name} subtitle={summary} />
        </ApprovalCard>
    );
}

const PIN_COPY: Record<string, string> = { true: "Pin", false: "Unpin" };

/** "Renamed from “Old” · Pin · <filters>" */
function focusViewChanges(input: { name?: string; pinned?: boolean }, current: string | undefined, summary: string | undefined) {
    return [
        input.name && current && input.name !== current ? `Renamed from “${current}”` : null,
        PIN_COPY[String(input.pinned)],
        summary,
    ].filter(Boolean).join(" · ");
}

export function UpdateFocusViewCard({ ctx }: { ctx: ToolRenderContext<"save_focus_view"> | RetiredRenderContext }) {
    const { data: views } = useFocusViews();
    const input = ctx.part?.input ?? {};
    const current = views?.find((view) => view.id === input.focusViewId)?.name;
    const name: string = input.name ?? current ?? ctx.part?.output?.name ?? "this view";
    const changes = focusViewChanges(input, current, useFilterSummary(input.filters));
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHANGE FOCUS VIEW"
            eyebrowGlyph={Filter}
            ariaLabel={`Change focus view: ${name}`}
            primaryLabel="Save"
            primaryGlyph={Check}
            doneText={`Updated the “${name}” view.`}
        >
            <IdentityBlock title={name} subtitle={changes || undefined} />
        </ApprovalCard>
    );
}

/** `delete_focus_view` is permanent (no task changes). Auto still waits for this tap. */
export function DeleteFocusViewCard({ ctx }: { ctx: ToolRenderContext<"delete_focus_view"> }) {
    const name: string = ctx.part?.input?.name ?? ctx.part?.output?.deleted ?? "this view";
    return (
        <DeleteApprovalCard
            ctx={ctx}
            eyebrow="DELETE FOCUS VIEW"
            ariaLabel={`Delete focus view: ${name}`}
            doneText={`Deleted the “${name}” view.`}
        >
            <IdentityBlock title={name} tone="danger" />
        </DeleteApprovalCard>
    );
}
