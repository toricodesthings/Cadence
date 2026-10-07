/**
 * Cards for organizing writes: `update_project`/`delete_project`,
 * `update_tag`/`delete_tag`, and the saved focus view writes.
 */
import { AlertCircle, Check, Filter, FolderPen, Tag as TagIcon, Trash2 } from "lucide-react";
import { IdentityBlock, TagPill } from "./ProposalCard";
import { ApprovalCard, type ToolRenderContext } from "./ApprovalCard";
import { useTagsLookup } from "./card-lookups";
import { useAssistantPersona } from "../../../hooks/ai/use-assistant-persona";
import { useProjects } from "../../../hooks/projects/use-projects";
import { useFocusViews } from "../../../hooks/core/use-focus-views";
import { PRIORITY_OPTIONS, EFFORT_OPTIONS } from "../../tasks/task-choice-options";

function useProjectName() {
    const { data } = useProjects();
    return (id?: string) => data?.find((project) => project.id === id)?.name;
}

export function UpdateProjectCard({ ctx }: { ctx: ToolRenderContext }) {
    const projectName = useProjectName();
    const input = ctx.part?.input ?? {};
    const patch: { name?: string; emoji?: string | null; colorAccent?: string } = input.patch ?? {};
    const current = projectName(input.projectId) ?? ctx.part?.output?.name ?? "this list";
    const name = patch.name ?? current;
    const changes = [
        patch.name && patch.name !== current ? `Renamed from “${current}”` : null,
        patch.emoji === null ? "No emoji" : patch.emoji ? "New emoji" : null,
        patch.colorAccent ? `Colour: ${patch.colorAccent}` : null,
    ].filter(Boolean).join(" · ");
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
            <IdentityBlock title={`${patch.emoji ? `${patch.emoji} ` : ""}${name}`} subtitle={changes || undefined} />
        </ApprovalCard>
    );
}

/** `delete_project` is permanent; what happens to its tasks is on the card. Auto still waits for this tap. */
export function DeleteProjectCard({ ctx }: { ctx: ToolRenderContext }) {
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
        <ApprovalCard
            ctx={ctx}
            tone="danger"
            eyebrow="DELETE LIST"
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete list: ${name}`}
            primaryLabel="Delete list"
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            doneText={done}
            declinedText="Kept it."
        >
            <IdentityBlock title={name} tone="danger" />
            <p className="text-xs text-twilight-text-soft">
                {trash ? "Its sections go too; its open tasks move to Trash (restorable)." : "Its sections go too; its tasks stay, with no list."}
            </p>
        </ApprovalCard>
    );
}

export function UpdateTagCard({ ctx }: { ctx: ToolRenderContext }) {
    const lookupTags = useTagsLookup();
    const input = ctx.part?.input ?? {};
    const [current] = lookupTags(input.tagId ? [input.tagId] : []);
    const patch: { name?: string; color?: string } = input.patch ?? {};
    const name = patch.name ?? current?.name ?? ctx.part?.output?.name ?? "this tag";
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
            <IdentityBlock
                title={`#${name}`}
                subtitle={[patch.name && current && patch.name !== current.name ? `Renamed from #${current.name}` : null, patch.color ? `Colour: ${patch.color}` : null].filter(Boolean).join(" · ") || undefined}
            />
            {current ? <div className="flex"><TagPill tag={{ ...current, name, color: patch.color ?? current.color }} /></div> : null}
        </ApprovalCard>
    );
}

/** `delete_tag` is permanent; tasks and routines keep everything but the tag. Auto still waits for this tap. */
export function DeleteTagCard({ ctx }: { ctx: ToolRenderContext }) {
    const persona = useAssistantPersona();
    const name: string = ctx.part?.input?.name ?? ctx.part?.output?.deleted ?? "this tag";
    return (
        <ApprovalCard
            ctx={ctx}
            tone="danger"
            eyebrow="DELETE TAG"
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete tag: ${name}`}
            primaryLabel="Delete it"
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            doneText={`Deleted #${name}.`}
            declinedText="Kept it."
        >
            <IdentityBlock title={`#${name}`} tone="danger" />
            {persona.terse ? null : <p className="text-xs text-twilight-text-soft">It comes off every task and routine; they stay.</p>}
        </ApprovalCard>
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

/** "Client · High+ · Low effort · Due this week", from the filters a view sets. */
function useFilterSummary(filters: ViewFilters = {}) {
    const projectName = useProjectName();
    const lookupTags = useTagsLookup();
    return [
        filters.states?.length ? filters.states.map((state) => STATE_COPY[state] ?? state).join(" + ") : null,
        ...(filters.projectIds ?? []).map((id) => projectName(id) ?? "a list"),
        ...lookupTags(filters.tagIds ?? []).map((tag) => `#${tag.name}`),
        filters.needsDate ? "No date" : null,
        filters.needsProject ? "No list" : null,
        filters.priorityMin ? `${PRIORITY_OPTIONS.find((o) => o.value === filters.priorityMin)?.label ?? filters.priorityMin}+ priority` : null,
        filters.effortMin ? `${EFFORT_OPTIONS.find((o) => o.value === filters.effortMin)?.label ?? filters.effortMin} effort or more` : null,
        filters.effortMax ? `${EFFORT_OPTIONS.find((o) => o.value === filters.effortMax)?.label ?? filters.effortMax} effort or less` : null,
        filters.durationMaxMinutes ? `${filters.durationMaxMinutes} min or less` : null,
        filters.dueWindow ? DUE_COPY[filters.dueWindow] ?? filters.dueWindow : null,
        filters.waitingOnly ? "Waiting only" : null,
        filters.missingStructureOnly ? "Missing a date or list" : null,
        filters.sortMode ? `Sort: ${filters.sortMode}` : null,
    ].filter(Boolean).join(" · ") || undefined;
}

export function CreateFocusViewCard({ ctx }: { ctx: ToolRenderContext }) {
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

export function UpdateFocusViewCard({ ctx }: { ctx: ToolRenderContext }) {
    const { data: views } = useFocusViews();
    const input = ctx.part?.input ?? {};
    const current = views?.find((view) => view.id === input.focusViewId)?.name;
    const name: string = input.name ?? current ?? ctx.part?.output?.name ?? "this view";
    const summary = useFilterSummary(input.filters);
    const changes = [
        input.name && current && input.name !== current ? `Renamed from “${current}”` : null,
        input.pinned === true ? "Pin" : input.pinned === false ? "Unpin" : null,
        summary,
    ].filter(Boolean).join(" · ");
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
export function DeleteFocusViewCard({ ctx }: { ctx: ToolRenderContext }) {
    const name: string = ctx.part?.input?.name ?? ctx.part?.output?.deleted ?? "this view";
    return (
        <ApprovalCard
            ctx={ctx}
            tone="danger"
            eyebrow="DELETE FOCUS VIEW"
            eyebrowGlyph={AlertCircle}
            ariaLabel={`Delete focus view: ${name}`}
            primaryLabel="Delete it"
            primaryGlyph={Trash2}
            primaryVariant="cardDanger"
            declineLabel="Keep it"
            doneText={`Deleted the “${name}” view.`}
            declinedText="Kept it."
        >
            <IdentityBlock title={name} tone="danger" />
        </ApprovalCard>
    );
}
