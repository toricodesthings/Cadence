import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Calendar, FolderOpen, Inbox } from "lucide-react";
import type { ResetDisposition } from "@cadence/contracts/planning";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { InstructionPatch } from "@cadence/domain/task-instruction";
import { today } from "../../../lib/utils/user-zone";
import { useThoughtParse } from "../../../hooks/inbox/use-thought-parse";
import { useProjects } from "../../../hooks/projects/use-projects";
import { toDay, formatShortDate, formatShortDateTime } from "../../../lib/utils/date-format";
import { storedSuggestion } from "../../../lib/utils/task/suggested-placement";
import { ResolvingRow, StepEmpty, StepShell } from "../StepShell";
import { dayActions, ReviewListItem, type ReviewAction, type ReviewActions } from "./shared";
import type { useWeekRoom } from "../../../hooks/core/use-week-room";

/**
 * A capture row. The primary is the day its words name (today's words only), else the model's guess, else Today.
 * A list the server already suggested shows as a chip; tapping it puts the task in that list on placement.
 */
export function CaptureReviewRow({ item, guess, dayFor, review }: {
    item: InboxItem;
    guess?: ResetDisposition;
    dayFor: ReturnType<typeof useWeekRoom>["dayFor"];
    review: ReviewActions;
}) {
    const parse = useThoughtParse(item.rawText, (item.analysis?.dismissedEntityIds ?? []) as string[]);
    const { data: projects = [] } = useProjects();
    const suggestion = storedSuggestion(item);
    const list = suggestion ? projects.find((p) => p.id === suggestion.projectId) : undefined;
    const [useList, setUseList] = useState(false);
    const listPatch: InstructionPatch = useList && suggestion ? { projectId: suggestion.projectId, ...(suggestion.sectionId && { sectionId: suggestion.sectionId }) } : {};
    // A capture from an earlier day: its "tomorrow" is not today's, so no day is proposed from its words.
    const fresh = toDay(item.createdAt) === today();
    const start = fresh ? parse.scheduledStart : null;
    const day = fresh ? parse.dueDate : null;
    const words: ReviewAction | null = start
        ? { label: formatShortDateTime(start), icon: Calendar, onClick: () => review.placeCapture(item, { patch: { ...listPatch, scheduledStart: start, scheduledEnd: parse.scheduledEnd, dueDate: null } }) }
        : day ? { label: formatShortDate(day), icon: Calendar, onClick: () => review.placeCapture(item, { day, patch: listPatch }) } : null;
    return (
        <ReviewListItem
            title={item.rawText || "Empty"}
            onRename={(text) => review.renameCapture(item, text)}
            actionKeyPrefix={`inbox:${item.id}`}
            chip={list ? (
                <button
                    type="button"
                    onClick={() => setUseList((on) => !on)}
                    aria-pressed={useList}
                    aria-label={`Put in ${list.name}`}
                    className={`inline-flex min-h-8 w-fit cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors ${
                        useList ? "surface-control-accent text-accent-primary" : "surface-control text-twilight-text-soft hover:text-twilight-text"
                    }`}
                >
                    <FolderOpen size={13} aria-hidden="true" /> → {list.name}
                </button>
            ) : null}
            actions={dayActions({
                words,
                guess,
                dayFor,
                place: (choice) => review.placeCapture(item, "later" in choice ? { waitlist: true, patch: listPatch } : { day: choice.day, patch: listPatch }),
                trash: () => review.handleInboxAction(item, "delete"),
            })}
            typed={{ placeholder: "Say when, like “Fri 3pm”", applyLabel: "Place", onApply: (patch) => review.placeCapture(item, { patch: { ...listPatch, ...patch } }) }}
            pendingActionKey={review.pendingActionKey}
            actionError={review.actionError}
            onRunAction={review.runCardAction}
        />
    );
}

/* ─── Step 1 · Captures ─── */
export function InboxStep({ review, guesses, dayFor, onTitleVisible }: {
    review: ReviewActions;
    guesses: Record<string, ResetDisposition>;
    dayFor: ReturnType<typeof useWeekRoom>["dayFor"];
    onTitleVisible?: (visible: boolean) => void;
}) {
    const { inboxItems } = review;
    return (
        <StepShell step={1} count={inboxItems.length} onTitleVisible={onTitleVisible}>
            {inboxItems.length > 0 ? (
                <div className="grid gap-2 @5xl:grid-cols-2">
                    <AnimatePresence initial={false}>
                        {inboxItems.map((item) => (
                            <ResolvingRow key={item.id}>
                                <CaptureReviewRow item={item} guess={guesses[item.id]} dayFor={dayFor} review={review} />
                            </ResolvingRow>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <StepEmpty icon={Inbox} title="All clear" />
            )}
        </StepShell>
    );
}
