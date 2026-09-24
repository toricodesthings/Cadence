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
import { ParseSummaryChips } from "../tasks/ParseSummaryChips";
import { QuickScheduleSurface } from "../tasks/QuickScheduleSurface";
import { CaptureDayChips } from "./CaptureDayChips";
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
    const { lightest } = useWeekLoad(new Date());
    const [custom, setCustom] = useState(false);
    const [schedule, setSchedule] = useState({
        dueDate: null as string | null,
        scheduledStart: null as string | null,
        scheduledEnd: null as string | null,
        isAllDay: true,
        recurrenceRule: null as string | null,
    });
    const save = (patch: NonNullable<typeof stored>) =>
        update.mutate({ id: item.id, analysis: { ...item.analysis, userOverrides: { ...stored, ...patch } } });
    const place = async (date?: string, openEditor = false, useCustom = false) => {
        const task = await process.mutateAsync({
            inboxItemId: item.id,
            rawText: item.rawText,
            title,
            projectId,
            tagIds,
            priority: parse.priority,
            durationEstimate: parse.durationMinutes,
            ...(useCustom
                ? schedule
                : date
                  ? { scheduledDate: date }
                  : { dueDate: null, scheduledStart: null, scheduledEnd: null, isAllDay: true }),
            nlp: {
                rawInput: item.rawText,
                sourceSurface: "clarify_sheet",
                dateStyle: settings?.dateTime.dateStyle ?? "mdy",
                dismissedEntityIds: dismissed,
                userOverrides: { title, projectId, tagIds },
            },
            skipOptimisticRemoval: openEditor,
            successLabel: openEditor ? "Made a task" : undefined,
        });
        if (task && openEditor) onOpenFullEditor?.(task.id);
        else onClose();
    };
    const runPlace = (date?: string, openEditor = false, useCustom = false) => {
        void place(date, openEditor, useCustom).catch(() => {});
    };
    const openCustom = () => {
        const detected = parse.scheduledStart ?? parse.dueDate;
        setSchedule({
            dueDate: parse.scheduledStart ? null : detected,
            scheduledStart: parse.scheduledStart,
            scheduledEnd: null,
            isAllDay: !parse.scheduledStart,
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
                <ParseSummaryChips
                    parseResult={{
                        ...parse.parseResult,
                        entities: parse.parseResult.entities.filter(
                            // When, List and Tags show these below; the chips cover what has no field of its own.
                            (e) => !["due_date", "scheduled_start", "project", "tag"].includes(e.type),
                        ),
                    }}
                    summary=""
                    onDismiss={(id) =>
                        update.mutate({
                            id: item.id,
                            analysis: { ...item.analysis, dismissedEntityIds: [...dismissed, id] },
                        })
                    }
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
