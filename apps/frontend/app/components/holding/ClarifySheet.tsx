import { useState } from "react";
import { CalendarDays, FolderOpen, MessageSquare, MoreVertical, Tag } from "lucide-react";
import type { InboxItem } from "@cadence/contracts/inbox";
import { useThoughtParse } from "../../hooks/inbox/use-thought-parse";
import { useProcessInboxToTask } from "../../hooks/inbox/use-process-inbox-to-task";
import { useUpdateInboxItem } from "../../hooks/inbox/use-update-inbox-item";
import { useCaptureActions } from "../../hooks/inbox/use-capture-actions";
import { useSettings } from "../../hooks/core/use-settings";
import { useProjects } from "../../hooks/projects/use-projects";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { DetailTitle } from "../shared/DetailTitle";
import { CARD, DetailGroup, FieldBlock, FieldRow, ValueSelect } from "../shared/DetailPanelSections";
import { Button } from "../primitives/Button";
import { Tip } from "../primitives/Tooltip";
import * as Menu from "../primitives/DropdownMenu";
import { TagField } from "../tasks/TagField";
import { resolvedNlp } from "../../lib/utils/task/resolved-nlp";
import { DraftRow } from "../tasks/DraftRow";
import { QuickScheduleSurface, type ScheduleUpdates } from "../tasks/QuickScheduleSurface";
import type { Instant, LocalDate } from "@cadence/domain/time";
import { today } from "../../lib/utils/user-zone";
import { CaptureDayChips, placeFields } from "./CaptureDayChips";
import { useWeekLoad } from "./PlaceSheet";

interface ClarifySheetProps {
    item: InboxItem;
    onClose: () => void;
    onOpenFullEditor?: (id: string) => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}
export function ClarifySheet({
    item,
    onClose,
    onOpenFullEditor,
    detailMode = "peek",
    onDetailModeChange,
}: ClarifySheetProps) {
    const { data: settings } = useSettings();
    const update = useUpdateInboxItem();
    const process = useProcessInboxToTask();
    const status = useCaptureActions();
    const { data: projects = [] } = useProjects();
    const stored = item.analysis?.userOverrides as
        | { title?: string; projectId?: string | null; tagIds?: string[] }
        | undefined;
    const dismissed = (item.analysis?.dismissedEntityIds ?? []) as string[];
    const parse = useThoughtParse(item.rawText, dismissed);
    const title = stored?.title ?? (parse.cleanedTitle || item.rawText);
    const projectId = stored?.projectId !== undefined ? stored.projectId : parse.projectId;
    const tagIds = stored?.tagIds ?? parse.tagIds;
    const { lightest } = useWeekLoad(today());
    const [custom, setCustom] = useState(false);
    const [schedule, setSchedule] = useState<ScheduleUpdates>({
        dueDate: null,
        endDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        recurrenceRule: null,
    });
    const save = (patch: NonNullable<typeof stored>) =>
        update.mutate({ id: item.id, analysis: { ...item.analysis, userOverrides: { ...stored, ...patch } } });
    const place = async (when?: LocalDate | Instant, openEditor = false, useCustom = false) => {
        const task = await process.mutateAsync({
            inboxItemId: item.id,
            rawText: item.rawText,
            title,
            projectId,
            tagIds,
            priority: parse.priority,
            durationEstimate: parse.durationMinutes,
            // A picked schedule: an all-day day (or a span's first day) or a timed block; else a placement; else none.
            ...(useCustom
                ? {
                      scheduledDay: schedule.scheduledStart ? undefined : schedule.dueDate,
                      scheduledStart: schedule.scheduledStart,
                      scheduledEnd: schedule.scheduledEnd,
                      recurrenceRule: schedule.recurrenceRule,
                  }
                : when
                  ? placeFields(when)
                  : { dueDate: null, scheduledStart: null, scheduledEnd: null }), // explicit nulls: the server must not infer a day from the text
            waitingOn: parse.waitingOn,
            nlp: resolvedNlp(item.rawText, "clarify_sheet", settings?.dateTime.dateStyle ?? "mdy", dismissed, { title, projectId, tagIds }),
            skipOptimisticRemoval: openEditor,
            successLabel: openEditor ? "Made a task" : undefined,
        });
        if (task && openEditor) onOpenFullEditor?.(task.id);
        else onClose();
    };
    const runPlace = (when?: LocalDate | Instant, openEditor = false, useCustom = false) => {
        void place(when, openEditor, useCustom).catch(() => {});
    };
    const openCustom = () => {
        const detected = parse.scheduledStart ?? parse.dueDate;
        setSchedule({
            dueDate: parse.scheduledStart ? null : detected,
            endDate: null,
            scheduledStart: parse.scheduledStart,
            scheduledEnd: null,
            recurrenceRule: parse.recurrenceRule,
        });
        setCustom(true);
    };
    const disabled = process.isPending || update.isPending;

    return (
        <DetailPanelLayout
            title={title}
            leading={<MessageSquare size={20} aria-hidden />}
            onClose={onClose}
            closeLabel="Close thought details"
            mode={detailMode}
            onModeChange={onDetailModeChange}
        >
            <DetailTitle value={title} label="Edit thought title" onSave={(next) => save({ title: next })}>
                <DraftRow
                    applied={parse.applied}
                    suggestions={[]}
                    // When, List and Tags show these below; the row covers what has no field of its own.
                    shownElsewhere={["due_date", "scheduled_start", "project", "tag"]}
                    literal={false}
                    onDismiss={(id) =>
                        update.mutate({
                            id: item.id,
                            analysis: { ...item.analysis, dismissedEntityIds: [...dismissed, id] },
                        })
                    }
                    onAccept={() => {}}
                    onLiteral={() => {}}
                />
                {title.trim() !== item.rawText.trim() && (
                    <p className="mt-2 text-xs text-twilight-text-muted">From: {item.rawText}</p>
                )}
            </DetailTitle>
            <div className={`${CARD} flex shrink-0 flex-col`}>
                <DetailGroup title="When">
                    <FieldBlock icon={CalendarDays} label="Place on">
                        <CaptureDayChips
                            detected={parse.scheduledStart ?? parse.dueDate}
                            lightest={lightest}
                            onPlace={runPlace}
                            onPick={openCustom}
                            disabled={disabled}
                        />
                    </FieldBlock>
                    {custom && (
                        <div className="flex flex-col gap-3 pt-2">
                            <QuickScheduleSurface
                                {...schedule}
                                onChange={(patch) => setSchedule((old) => ({ ...old, ...patch }))}
                                onRequestClose={() => setCustom(false)}
                            />
                            <Button
                                disabled={disabled || (!schedule.dueDate && !schedule.scheduledStart)}
                                onClick={() => runPlace(undefined, false, true)}
                            >
                                Place with this schedule
                            </Button>
                        </div>
                    )}
                </DetailGroup>
                <DetailGroup title="Organize">
                    <FieldRow icon={FolderOpen} label="List">
                        <ValueSelect
                            label="List"
                            value={projectId ?? ""}
                            onChange={(id) => save({ projectId: id || null })}
                            options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                        />
                    </FieldRow>
                    <FieldBlock icon={Tag} label="Tags">
                        <TagField
                            tagIds={tagIds}
                            onAdd={(id) => save({ tagIds: [...tagIds, id] })}
                            onRemove={(id) => save({ tagIds: tagIds.filter((t) => t !== id) })}
                        />
                    </FieldBlock>
                </DetailGroup>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="secondary" className="flex-1" disabled={disabled} onClick={() => runPlace()}>
                    Keep with no day
                </Button>
                <Menu.Root>
                    <Tip label="More actions">
                        <Menu.Trigger asChild>
                            <Button variant="ghost" size="icon" aria-label="More thought actions">
                                <MoreVertical size={18} />
                            </Button>
                        </Menu.Trigger>
                    </Tip>
                    <Menu.Content align="end">
                        {onOpenFullEditor && (
                            <Menu.Item disabled={disabled} onSelect={() => runPlace(undefined, true)}>
                                <span>
                                    Make it a task
                                    <span className="block text-xs text-twilight-text-muted">
                                        No day yet · opens it for details
                                    </span>
                                </span>
                            </Menu.Item>
                        )}
                        <Menu.Item
                            disabled={disabled}
                            onSelect={() => {
                                void status
                                    .setStatus(item, "kept")
                                    .then(onClose)
                                    .catch(() => {});
                            }}
                        >
                            Keep as a note
                        </Menu.Item>
                        <Menu.Item
                            disabled={disabled}
                            variant="danger"
                            onSelect={() => {
                                void status
                                    .setStatus(item, "discarded")
                                    .then(onClose)
                                    .catch(() => {});
                            }}
                        >
                            Discard
                        </Menu.Item>
                    </Menu.Content>
                </Menu.Root>
            </div>
        </DetailPanelLayout>
    );
}
