import { Sun, Sunrise, Moon, Trash2 } from "lucide-react";
import { today } from "../../../lib/utils/user-zone";
import { useThoughtParse } from "../../../hooks/inbox/use-thought-parse";
import { toDay, formatShortDate, formatShortDateTime } from "../../../lib/utils/date-format";
import type { InstructionPatch } from "@cadence/domain/task-instruction";
import type { InboxItem } from "@cadence/contracts/inbox";
import { type ReviewAction, ReviewListItem, SkipToNext, StepDone, StepPanel, type StepProps } from "./shared";


/** A capture row: the one obvious placement is the day its words name (when they are today's words), else Today. */
export function CaptureReviewRow({
    item,
    onPlace,
    onAction,
    pendingActionKey,
    actionError,
    onRunAction,
}: {
    item: InboxItem;
    onPlace: (choice: { day?: string; patch?: InstructionPatch }) => Promise<void>;
    onAction: (action: "today" | "tomorrow" | "someday" | "delete") => Promise<void>;
    pendingActionKey: string | null;
    actionError: string | null;
    onRunAction: (key: string, fn: () => Promise<void>) => void;
}) {
    const parse = useThoughtParse(item.rawText, (item.analysis?.dismissedEntityIds ?? []) as string[]);
    // A capture from an earlier day: its "tomorrow" is not today's, so no day is proposed from its words.
    const fresh = toDay(item.createdAt) === today();
    const start = fresh ? parse.scheduledStart : null;
    const day = fresh ? parse.dueDate : null;
    const proposed = start ?? day;
    const primary: ReviewAction = proposed
        ? {
            label: `Place on ${start ? formatShortDateTime(start) : formatShortDate(day!)}`,
            shortLabel: start ? formatShortDateTime(start) : formatShortDate(day!),
            icon: Sun,
            onClick: () => onPlace(start ? { patch: { scheduledStart: start, scheduledEnd: parse.scheduledEnd, dueDate: null } } : { day: day! }),
            variant: "cardPrimary",
        }
        : { label: "Do Today", shortLabel: "Today", icon: Sun, onClick: () => onAction("today"), variant: "cardPrimary" };
    return (
        <ReviewListItem
            title={item.rawText || "Empty"}
            actionKeyPrefix={`inbox:${item.id}`}
            actions={[
                primary,
                ...(proposed ? [{ label: "Do Today", shortLabel: "Today", icon: Sun, onClick: () => onAction("today") }] : []),
                { label: "Do Tomorrow", shortLabel: "Tomorrow", icon: Sunrise, onClick: () => onAction("tomorrow") },
                { label: "Decide Later", shortLabel: "Later", icon: Moon, onClick: () => onAction("someday") },
                { label: "Move to Trash", shortLabel: "Trash", icon: Trash2, onClick: () => onAction("delete"), variant: "danger" },
            ]}
            typed={{ placeholder: "Friday 3pm for 30 min, in Work…", applyLabel: "Place", onApply: (patch) => onPlace({ patch }) }}
            pendingActionKey={pendingActionKey}
            actionError={actionError}
            onRunAction={onRunAction}
        />
    );
}

/* ─── Step 1 · Inbox ─── */
export function InboxStep({ review, onNext }: StepProps) {
    const { inboxItems } = review;
    return (
        <StepPanel title="Captured thoughts" intro={inboxItems.length > 0
                ? `${inboxItems.length} item${inboxItems.length > 1 ? "s" : ""} to sort through.`
                : "Nothing here — inbox is clear."}>
            {inboxItems.length > 0 ? (
                <div className="flex flex-col gap-2">
                    {inboxItems.map((item) => (
                        <CaptureReviewRow
                            key={item.id}
                            item={item}
                            onPlace={(choice) => review.placeCapture(item, choice)}
                            onAction={(action) => review.handleInboxAction(item, action)}
                            pendingActionKey={review.pendingActionKey}
                            actionError={review.actionError}
                            onRunAction={review.runCardAction}
                        />
                    ))}
                </div>
            ) : (
                <StepDone label="Inbox is clear." onNext={onNext} />
            )}
            {inboxItems.length > 0 && <SkipToNext onSkip={onNext} />}
        </StepPanel>
    );
}
