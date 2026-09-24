import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, CalendarDays, Pause, Play, SlidersHorizontal, StickyNote, Trash2 } from "lucide-react";
import { HABIT_WEEKDAYS, type Habit } from "@cadence/contracts/habit";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { useDeleteHabit } from "../../hooks/habits/use-delete-habit";
import { usePauseHabit, useResumeHabit } from "../../hooks/habits/use-pause-habit";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { DetailTitle } from "../shared/DetailTitle";
import { CARD, PANEL_TRIGGER, PanelHeader, PanelTrigger } from "../shared/DetailPanelSections";
import { HabitHistoryCalendar } from "./HabitHistoryCalendar";
import { CadencePicker } from "./CadencePicker";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { Switch } from "../primitives/Switch";
import { TimePicker } from "../primitives/TimePicker";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { formatTime, fromTimeValue, toISODate } from "../../lib/utils/date-format";
import { RepeatKindPicker } from "../shared/RepeatKindPicker";
import { RoutineMark } from "./RoutineMark";
import { useConvertRepeat } from "../../hooks/habits/use-convert-repeat";
import { useSettings } from "../../hooks/core/use-settings";

const DAY_LABELS: Record<(typeof HABIT_WEEKDAYS)[number], string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

/** Per-weekday times: empty = the usual time, "Any time" = no time that day. */
function DayTimes({ habit, onChange }: { habit: Habit; onChange: (targetTimes: Record<string, string> | null) => void }) {
    const times = habit.targetTimes ?? {};
    const set = (day: string, value: string | undefined) => {
        const next = { ...times };
        if (value === undefined) delete next[day];
        else next[day] = value;
        onChange(Object.keys(next).length ? next : null);
    };
    return (
        <div className="space-y-1.5" role="group" aria-label="Times by day">
            {HABIT_WEEKDAYS.map((day) => {
                const override = times[day];
                const anyTime = override === "";
                return (
                    <div key={day} className="flex items-center gap-2">
                        <span className="w-9 shrink-0 text-xs text-twilight-text-muted">{DAY_LABELS[day]}</span>
                        <TimePicker
                            label={`${DAY_LABELS[day]} time`}
                            value={override || ""}
                            placeholder={habit.targetTime ? formatTime(fromTimeValue(toISODate(new Date()), habit.targetTime)) : undefined}
                            disabled={anyTime}
                            clearable
                            onChange={(value) => set(day, value || undefined)}
                            className="min-w-0 flex-1"
                        />
                        <button
                            type="button"
                            aria-pressed={anyTime}
                            onClick={() => set(day, anyTime ? undefined : "")}
                            className={`min-h-10 shrink-0 cursor-pointer rounded-xl border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${anyTime ? "border-accent-primary/30 bg-accent-primary/15 text-accent-primary" : "border-white/[0.06] bg-white/[0.02] text-twilight-text-soft hover:bg-white/[0.05]"}`}
                        >
                            Any time
                        </button>
                    </div>
                );
            })}
            <p className="text-xs text-twilight-text-muted">Empty days use the usual time.</p>
        </div>
    );
}

const FIELD = "w-full min-w-0 rounded-xl border border-twilight-border/35 bg-white/[0.03] px-3 py-2.5 text-sm text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

export function HabitEditor({ habit, onClose, detailMode = "peek", onDetailModeChange }: {
    habit: Habit;
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}) {
    const [section, setSection] = useState<"notes" | "details" | "history" | null>("notes");
    const [notes, setNotes] = useState(habit.notes ?? "");
    const [purpose, setPurpose] = useState(habit.description ?? "");
    const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [dayTimesOpen, setDayTimesOpen] = useState(Boolean(habit.targetTimes));
    const convertRepeat = useConvertRepeat();
    const { data: settings } = useSettings();
    const showStreaks = settings?.tasks?.showStreaks !== false;
    useEffect(() => setNotes(habit.notes ?? ""), [habit.notes]);
    useEffect(() => setPurpose(habit.description ?? ""), [habit.description]);
    const updateHabit = useUpdateHabit();
    const deleteHabit = useDeleteHabit();
    const { pause } = usePauseHabit();
    const { resume } = useResumeHabit();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const isPaused = Boolean(habit.pausedUntil && new Date(habit.pausedUntil) > new Date());
    const habitTags = tags.filter((tag) => habit.tagIds?.includes(tag.id));
    const status = habit.archived ? "Archived" : isPaused ? "Paused" : "Active";
    const routineSummary = `${getTaskRecurrenceSummary({
        recurrenceRule: habit.recurrenceRule,
        scheduledStart: habit.targetTime ? new Date(`${toISODate(new Date())}T${habit.targetTime}:00`).toISOString() : null,
        scheduledEnd: null,
    })?.label ?? "Repeats"}${habit.targetTime ? "" : ", any time"}`;
    const routineStatus = status !== "Active" ? status : showStreaks && habit.currentStreak > 0 ? `${habit.currentStreak} in a row` : `${habit.totalCompletions} check-ins`;

    return (
        <div className="h-full min-w-0 overflow-hidden" role="complementary" aria-label="Routine details">
            <DetailPanelLayout title="Routine" mode={detailMode} onModeChange={onDetailModeChange} onClose={onClose} closeLabel="Close routine details" leading={<RoutineMark size={20} className="text-accent-primary" />}>
                <DetailTitle value={habit.title} label="Routine title" maxLength={255} onSave={(title) => updateHabit.mutate({ id: habit.id, title })} />
                <div className={`${CARD} flex items-center gap-3 px-4 py-3`}>
                    <EmojiMarkButton emoji={habit.emoji} onChange={(emoji) => updateHabit.mutate({ id: habit.id, emoji })} fallback={<RoutineMark size={18} className="text-accent-primary" />} />
                    <div className="min-w-0">
                        <p className="truncate text-sm text-twilight-text">{routineSummary}</p>
                        <p className="truncate text-xs text-twilight-text-muted">{routineStatus}</p>
                    </div>
                </div>
                {section === "notes" ? (
                    <section className={`${CARD} space-y-3 px-4 py-3`}>
                        <PanelHeader title="Notes" onDone={() => setSection(null)} />
                        <textarea aria-label="Routine notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)}
                            onBlur={() => { if (notes !== (habit.notes ?? "")) updateHabit.mutate({ id: habit.id, notes: notes || null }); }}
                            placeholder="Reflections, intentions, context for this routine…"
                            className={`${FIELD} resize-y`} />
                    </section>
                ) : <PanelTrigger icon={StickyNote} title="Notes" summary={notes.trim() || "Tap to write notes"} onOpen={() => setSection("notes")} />}

                {section === "details" ? (
                    <section className={`${CARD} space-y-4 px-4 py-3`}>
                        <PanelHeader title="Details" summary={status} onDone={() => setSection(null)} />
                        <label className="block space-y-2 text-sm text-twilight-text-muted">
                            <span>Purpose</span>
                            <textarea aria-label="Routine purpose" rows={3} maxLength={10000} value={purpose} onChange={(e) => setPurpose(e.target.value)}
                                onBlur={() => { if (purpose !== (habit.description ?? "")) updateHabit.mutate({ id: habit.id, description: purpose.trim() || null }); }}
                                className={`${FIELD} resize-y`} />
                        </label>
                        <div className="space-y-2" role="group" aria-label="Cadence">
                            <p className="text-sm text-twilight-text-muted">Cadence</p>
                            <CadencePicker value={habit.recurrenceRule} onChange={(recurrenceRule) => updateHabit.mutate({ id: habit.id, recurrenceRule })} />
                        </div>
                        <div className="space-y-2 text-sm text-twilight-text-muted">
                            <span>Usual time</span>
                            <TimePicker label="Routine usual time" value={habit.targetTime ?? ""} placeholder="Any time" clearable
                                onChange={(value) => updateHabit.mutate({ id: habit.id, targetTime: value || null })} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {habit.targetTime ? <Button variant="ghost" size="sm" onClick={() => updateHabit.mutate({ id: habit.id, targetTime: null })}>Clear time</Button> : null}
                            <Button variant="ghost" size="sm" aria-expanded={dayTimesOpen} onClick={() => setDayTimesOpen((open) => !open)}>
                                {dayTimesOpen ? "Same time every day" : "Different times on some days"}
                            </Button>
                        </div>
                        {dayTimesOpen ? <DayTimes habit={habit} onChange={(targetTimes) => updateHabit.mutate({ id: habit.id, targetTimes })} /> : null}
                        <div className="flex items-center justify-between gap-3 text-sm text-twilight-text">
                            <span>Reminder</span>
                            <Switch checked={habit.reminderEnabled} aria-label="Routine reminder" onCheckedChange={(reminderEnabled) => updateHabit.mutate({ id: habit.id, reminderEnabled })} />
                        </div>
                        <label className="block space-y-2 text-sm text-twilight-text-muted">
                            <span>List</span>
                            <select aria-label="Routine list" value={habit.projectId ?? ""} onChange={(e) => updateHabit.mutate({ id: habit.id, projectId: e.target.value || null })} className={`${FIELD} cursor-pointer`}>
                                <option value="">No list</option>
                                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                            </select>
                        </label>
                        {habitTags.length ? <div className="space-y-2"><p className="text-sm text-twilight-text-muted">Tags</p><div className="flex flex-wrap gap-2">{habitTags.map((tag) => <span key={tag.id} className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-twilight-text-muted">{tag.name}</span>)}</div></div> : null}
                        {isPaused && habit.pausedUntil ? <p className="text-xs text-twilight-text-muted">Paused until {habit.pausedUntil}</p> : null}
                        <RepeatKindPicker
                            value="routine"
                            disabled={convertRepeat.isPending}
                            fixedUnavailableReason={habit.targetTime ? null : "Set a usual time to make it fixed."}
                            onChange={(kind) => {
                                if (kind === "routine") return;
                                void convertRepeat.routineToTask(habit, kind).then(onClose);
                            }}
                        />
                        <Button variant="ghost" size="md" onClick={() => isPaused ? resume(habit.id) : pause(habit.id)} className="w-full">
                            {isPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
                            {isPaused ? "Resume routine" : "Pause for 7 days"}
                        </Button>
                    </section>
                ) : <PanelTrigger icon={SlidersHorizontal} title="Details" summary={[status, habit.targetTime, habit.reminderEnabled ? "Reminder on" : null].filter(Boolean).join(" · ")} onOpen={() => setSection("details")} />}

                {section === "history" ? (
                    <section className={`${CARD} space-y-4 px-4 py-3`}>
                        <PanelHeader title="History" onDone={() => setSection(null)} />
                        <HabitHistoryCalendar habitId={habit.id} year={month.getFullYear()} month={month.getMonth()} onNavigate={(delta) => setMonth((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1))} />
                        <dl className="space-y-2 text-sm">
                            {[["Total check-ins", habit.totalCompletions], ...(showStreaks ? [["Current streak", habit.currentStreak], ["Longest streak", habit.longestStreak]] : [])].map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-2"><dt className="text-twilight-text-muted">{label}</dt><dd className="text-twilight-text">{value}</dd></div>
                            ))}
                        </dl>
                        <p className="text-xs text-twilight-text-muted">Created {new Date(habit.createdAt).toLocaleDateString()}</p>
                    </section>
                ) : <PanelTrigger icon={CalendarDays} title="History" summary={showStreaks ? `${habit.totalCompletions} check-ins · ${habit.currentStreak} in a row` : `${habit.totalCompletions} check-ins`} onOpen={() => setSection("history")} />}

                <Button variant="ghost" size="md" onClick={() => { updateHabit.mutate({ id: habit.id, archived: !habit.archived }); onClose(); }}>
                    {habit.archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                    {habit.archived ? "Restore routine" : "Archive routine"}
                </Button>
                <Button variant="ghost" size="none" type="button" aria-label="Delete routine" onClick={() => setDeleteOpen(true)} className={`${PANEL_TRIGGER} shrink-0 font-normal text-feedback-error`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-feedback-error/10"><Trash2 size={16} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Delete routine</span><span className="block text-xs text-twilight-text-muted">Permanently remove this routine and its history.</span></span>
                </Button>
            </DetailPanelLayout>
            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header><AlertDialog.Title>Delete "{habit.title}"?</AlertDialog.Title><AlertDialog.Description>All history and logs for this routine will be permanently removed. This cannot be undone.</AlertDialog.Description></AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild><Button variant="ghost" size="md">Cancel</Button></AlertDialog.Cancel>
                        <AlertDialog.Action asChild><Button variant="danger" size="md" onClick={() => { deleteHabit.mutate(habit.id); onClose(); }}>Delete routine</Button></AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </div>
    );
}
