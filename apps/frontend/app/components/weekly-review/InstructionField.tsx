import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { DraftField } from "@cadence/domain/nlp-draft";
import { findSectionMention, instructionPatch, isEmptyPatch, resolveSection, type InstructionPatch } from "@cadence/domain/task-instruction";
import { useNlpParse, useParseModule } from "../../hooks/use-nlp-parse";
import { nlpClock } from "../../lib/utils/date-format";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useAllSections } from "../../hooks/sections/use-sections";
import { useSettings } from "../../hooks/core/use-settings";
import { getUserZone } from "../../lib/utils/user-zone";
import { previewParts } from "../../lib/utils/task/instruction-preview";

/** What an instruction may change; never the title or notes. */
const INSTRUCTION_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>([
    "dueDate", "scheduledStart", "scheduledEnd", "durationMinutes", "projectId", "tagIds", "waitingOn", "priority",
]);

/**
 * One line to say what should change ("Friday 3pm for 30 min", "keep waiting until Monday", "put in Work").
 * It shows the change before anything is saved; Apply is the one commit.
 */
export function InstructionField({
    placeholder,
    applyLabel,
    disabled,
    onApply,
    autoFocus,
    listId = null,
}: {
    placeholder: string;
    applyLabel: string;
    disabled?: boolean;
    onApply: (patch: InstructionPatch) => void | Promise<void>;
    autoFocus?: boolean;
    /** The list of the one task this changes: a section name shared by several lists means this list's. */
    listId?: string | null;
}) {
    const [text, setText] = useState("");
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: settings } = useSettings();
    const sections = useAllSections(projects.map((p) => p.id), Boolean(text.trim()));
    // A named section is read first and blanked for the parser, so "Later This Week" is a place, not a date.
    const parse = useParseModule(Boolean(text.trim()));
    // The whole name is a day ("Today", "Monday"); "Later This Week" is a place that merely contains one.
    const namesADay = (name: string) => Boolean(parse?.({ input: name, sourceSurface: "task_edit_title", clock: nlpClock() }).entities
        .some((e) => (e.type === "due_date" || e.type === "scheduled_start") && e.sourceText.trim().length === name.trim().length));
    const mention = findSectionMention(text, sections, namesADay);
    const parsedText = mention ? text.slice(0, mention.start) + " ".repeat(mention.end - mention.start) + text.slice(mention.end) : text;
    const nlp = useNlpParse({
        input: parsedText,
        projects,
        tags,
        capabilities: INSTRUCTION_FIELDS,
        sourceSurface: "task_edit_title",
        dateStyle: settings?.dateTime?.dateStyle ?? "mdy",
        confidenceThreshold: settings?.tasks?.intelligence?.confidenceThreshold ?? "medium",
        enabled: settings?.tasks?.intelligence?.nlpEnabled !== false,
    });
    const section = resolveSection(mention, nlp.fields.projectId ?? listId);
    const read = (fields: typeof nlp.fields, title: string) => {
        const result = instructionPatch(parsedText, { fields, title, applied: [], suggestions: [], unfit: [] }, getUserZone(), resolveSection(mention, fields.projectId ?? listId));
        // A section name that matched more than one list (or not the named one) is shown as not read, never guessed.
        return mention && !resolveSection(mention, fields.projectId ?? listId) ? { ...result, unread: `${result.unread} ${text.slice(mention.start, mention.end)}`.trim() } : result;
    };
    const { patch, unread } = read(nlp.fields, nlp.cleanedTitle);
    const parts = previewParts(patch, { projects, tags, sections: section ? [section] : [] });
    const ready = !isEmptyPatch(patch);

    const apply = async () => {
        if (!ready || disabled) return;
        const done = nlp.ready ? patch : read((await nlp.finalize()).fields, parsedText).patch;
        await onApply(done);
        setText("");
    };

    return (
        <div className="flex w-full flex-col gap-1.5">
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
                <input
                    type="text"
                    value={text}
                    autoFocus={autoFocus}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    className="min-h-10 flex-1 rounded-xl border border-twilight-border/40 bg-transparent px-3 text-sm text-twilight-text outline-none placeholder:text-twilight-text-muted/60 focus:border-accent-primary/40"
                />
                <button
                    type="submit"
                    disabled={!ready || disabled}
                    className="touch-target inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-accent-primary/14 px-3.5 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/20 disabled:cursor-default disabled:opacity-40"
                >
                    {applyLabel}
                    <ArrowRight size={14} aria-hidden="true" />
                </button>
            </form>
            {text.trim() ? (
                <p role="status" className="text-xs text-twilight-text-soft">
                    {parts.length ? parts.join(" · ") : "Nothing I can change from that yet."}
                    {unread && parts.length ? <span className="text-twilight-text-muted"> · not read: “{unread}”</span> : null}
                </p>
            ) : null}
        </div>
    );
}
