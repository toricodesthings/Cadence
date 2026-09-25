import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { addDays } from "date-fns";
import { Archive, ArchiveRestore, Bell, CalendarDays, ChevronLeft, ChevronRight, Clock3, FolderOpen, Palette, Pause, Play, Repeat, SlidersHorizontal, StickyNote, Tag, Target, Trash2 } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { useRoutineActions } from "../../hooks/habits/use-routine-actions";
import { useHabitsRange } from "../../hooks/habits/use-habits";
import { useProjects } from "../../hooks/projects/use-projects";
import { useSettings } from "../../hooks/core/use-settings";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { DetailTitle } from "../shared/DetailTitle";
import { CARD, PANEL_TRIGGER, PanelHeader, PanelTrigger, DetailGroup, FieldBlock, FieldRow, ValueSelect, VALUE_BTN } from "../shared/DetailPanelSections";
import { Swatches } from "../shared/Swatches";
import { DatePicker } from "../shared/DatePicker";
import { TagField } from "../tasks/TagField";
import { CadencePicker } from "./CadencePicker";
import { DayTimes } from "./DayTimes";
import { RoutineDayCell } from "./RoutineDayCell";
import { RoutineMonthGrid } from "./RoutineMonthGrid";
import { logsByDay } from "./RoutineWeekRow";
import { Button } from "../primitives/Button";
import { Switch } from "../primitives/Switch";
import { TimePicker } from "../primitives/TimePicker";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { formatShortDate, getMonthDateRange, getWeekDates, MONTH_NAMES, toISODate, WEEK_START_INDEX } from "../../lib/utils/date-format";
import { ROUTINE_DEFAULT_ACCENT, ROUTINE_SWATCHES, routineTone } from "../../lib/utils/habits";
import { RepeatKindPicker } from "../shared/RepeatKindPicker";
import { RoutineMark } from "./RoutineMark";
import { useConvertRepeat } from "../../hooks/habits/use-convert-repeat";

const FIELD = "w-full min-w-0 rounded-xl border border-twilight-border/35 bg-white/[0.03] px-3 py-2.5 text-sm text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";
const PAUSES = [["3 days", 3], ["1 week", 7], ["2 weeks", 14]] as const;

/** This routine in the range's data (a week or a month), with its logs. */
function useRoutineInRange(habit: Habit, range: { start: string; end: string }, enabled = true) {
    const { data } = useHabitsRange({ ...range, archived: habit.archived, enabled });
    return data?.find((entry) => entry.id === habit.id);
}

export function HabitEditor({ habit, onClose, detailMode = "peek", onDetailModeChange }: {
    habit: Habit;
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}) {
    const [section, setSection] = useState<"notes" | "details" | "history" | null>(habit.notes?.trim() ? "notes" : null);
    const [notes, setNotes] = useState(habit.notes ?? "");
    const [purpose, setPurpose] = useState(habit.description ?? "");
    const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [dayTimesOpen, setDayTimesOpen] = useState(Boolean(habit.targetTimes));
    const convertRepeat = useConvertRepeat();
    const { data: settings } = useSettings();
    const showStreaks = settings?.tasks?.showStreaks !== false;
    const bloom = !settings?.tasks?.intelligence?.lowStimulationMode;
    const weekStartsOn = WEEK_START_INDEX[settings?.dateTime?.weekStart ?? "Sunday"];
    useEffect(() => setNotes(habit.notes ?? ""), [habit.notes]);
    useEffect(() => setPurpose(habit.description ?? ""), [habit.description]);
    const updateHabit = useUpdateHabit();
    const update = (patch: Omit<Parameters<typeof updateHabit.mutate>[0], "id">) => updateHabit.mutate({ id: habit.id, ...patch });
    const actions = useRoutineActions(habit, { onGone: onClose });
    const { data: projects = [] } = useProjects();

    const today = toISODate(new Date());
    const week = useMemo(() => getWeekDates(new Date(), weekStartsOn), [weekStartsOn]);
    const thisWeek = useRoutineInRange(habit, { start: toISODate(week[0]), end: toISODate(week[6]) });
    const weekLogs = logsByDay(thisWeek ?? habit);
    const historyMonth = useRoutineInRange(habit, getMonthDateRange(month.getFullYear(), month.getMonth()), section === "history");

    const status = habit.archived ? "Archived" : actions.isPaused ? `Paused until ${formatShortDate(habit.pausedUntil!)}` : "Active";
    const routineSummary = `${getTaskRecurrenceSummary({
        recurrenceRule: habit.recurrenceRule,
        scheduledStart: habit.targetTime ? new Date(`${today}T${habit.targetTime}:00`).toISOString() : null,
        scheduledEnd: null,
    })?.label ?? "Repeats"}${habit.targetTime ? "" : ", any time"}`;
    const routineStatus = habit.archived || actions.isPaused ? status : showStreaks && habit.currentStreak > 0 ? `${habit.currentStreak} in a row` : `${habit.totalCompletions} check-ins`;
    const tagIds = habit.tagIds ?? [];

    return (
        <div className="h-full min-w-0 overflow-hidden" role="complementary" aria-label="Routine details" style={{ "--routine-tone": routineTone(habit.colorAccent) } as CSSProperties}>
            <DetailPanelLayout title="Routine" mode={detailMode} onModeChange={onDetailModeChange} onClose={onClose} closeLabel="Close routine details" leading={<RoutineMark size={20} className="text-[var(--routine-tone)]" />}>
                <DetailTitle value={habit.title} label="Routine title" maxLength={255} onSave={(title) => update({ title })} />
                <div className={`${CARD} space-y-3 px-4 py-3`}>
                    <div className="flex items-center gap-3">
                        <span className="text-[var(--routine-tone)]">
                            <EmojiMarkButton emoji={habit.emoji} onChange={(emoji) => update({ emoji })} fallback={<RoutineMark size={18} />} />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-sm text-twilight-text">{routineSummary}</p>
                            <p className="truncate text-xs text-twilight-text-muted">{routineStatus}</p>
                        </div>
                    </div>
                    {habit.archived ? null : (
                        <div role="group" aria-label="This week" className="grid grid-cols-7 gap-1">
                            {week.map((date) => {
                                const iso = toISODate(date);
                                return (
                                    <div key={iso} className="flex flex-col items-center gap-1">
                                        <span aria-hidden="true" className={`text-[10px] font-semibold uppercase ${iso === today ? "text-[var(--routine-tone)]" : "text-twilight-text-muted"}`}>
                                            {date.toLocaleDateString("en-US", { weekday: "narrow" })}
                                        </span>
                                        <RoutineDayCell size="sm" habit={habit} date={iso} log={weekLogs.get(iso)} today={today} bloom={bloom} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {section === "notes" ? (
                    <section className={`${CARD} space-y-3 px-4 py-3`}>
                        <PanelHeader title="Notes" onDone={() => setSection(null)} />
                        <textarea aria-label="Routine notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)}
                            onBlur={() => { if (notes !== (habit.notes ?? "")) update({ notes: notes || null }); }}
                            placeholder="Reflections, intentions, context for this routine…"
                            className={`${FIELD} resize-y`} />
                    </section>
                ) : <PanelTrigger icon={StickyNote} title="Notes" summary={notes.trim() || "Tap to write notes"} onOpen={() => setSection("notes")} />}

                {section === "details" ? (
                    <section className={`${CARD} flex flex-col`}>
                        <div className="px-4 pb-1 pt-3"><PanelHeader title="Details" summary={status} onDone={() => setSection(null)} /></div>

                        <DetailGroup title="Rhythm">
                            <FieldBlock icon={Repeat} label="Repeats">
                                <CadencePicker value={habit.recurrenceRule} onChange={(recurrenceRule) => update({ recurrenceRule })} />
                            </FieldBlock>
                            <FieldRow icon={Clock3} label="Usual time">
                                <TimePicker label="Routine usual time" value={habit.targetTime ?? ""} placeholder="Any time" clearable onChange={(value) => update({ targetTime: value || null })} />
                            </FieldRow>
                            <Button variant="ghost" size="sm" aria-expanded={dayTimesOpen} onClick={() => setDayTimesOpen((open) => !open)} className="self-start">
                                {dayTimesOpen ? "Same time every day" : "Different times on some days"}
                            </Button>
                            {dayTimesOpen ? <DayTimes value={habit.targetTimes} usualTime={habit.targetTime} onChange={(targetTimes) => update({ targetTimes })} /> : null}
                            <FieldRow icon={Bell} label="Reminder">
                                <Switch checked={habit.reminderEnabled} aria-label="Routine reminder" onCheckedChange={(reminderEnabled) => update({ reminderEnabled })} />
                            </FieldRow>
                        </DetailGroup>

                        <DetailGroup title="Look">
                            <FieldBlock icon={Palette} label="Colour">
                                <Swatches options={ROUTINE_SWATCHES} value={ROUTINE_SWATCHES.some((o) => o.value === habit.colorAccent) ? habit.colorAccent : ROUTINE_DEFAULT_ACCENT} onChange={(colorAccent) => update({ colorAccent })} />
                            </FieldBlock>
                        </DetailGroup>

                        <DetailGroup title="Organize">
                            <FieldRow icon={FolderOpen} label="List">
                                <ValueSelect
                                    label="List"
                                    value={habit.projectId ?? ""}
                                    onChange={(id) => update({ projectId: id || null })}
                                    options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                                />
                            </FieldRow>
                            <FieldBlock icon={Tag} label="Tags">
                                <TagField
                                    tagIds={tagIds}
                                    onAdd={(id) => update({ tagIds: [...tagIds, id] })}
                                    onRemove={(id) => update({ tagIds: tagIds.filter((tagId) => tagId !== id) })}
                                />
                            </FieldBlock>
                            <FieldBlock icon={Target} label="Purpose">
                                <textarea aria-label="Routine purpose" rows={3} maxLength={10000} value={purpose} onChange={(e) => setPurpose(e.target.value)}
                                    onBlur={() => { if (purpose !== (habit.description ?? "")) update({ description: purpose.trim() || null }); }}
                                    placeholder="Why this routine matters to you…"
                                    className={`${FIELD} resize-y`} />
                            </FieldBlock>
                        </DetailGroup>

                        <DetailGroup title="Kind">
                            <RepeatKindPicker
                                value="routine"
                                disabled={convertRepeat.isPending}
                                fixedUnavailableReason={habit.targetTime ? null : "Set a usual time to make it fixed."}
                                onChange={(kind) => {
                                    if (kind === "routine") return;
                                    void convertRepeat.routineToTask(habit, kind).then(onClose);
                                }}
                            />
                        </DetailGroup>

                        {habit.archived ? null : (
                            <DetailGroup title="Pause">
                                {actions.isPaused ? (
                                    <Button variant="ghost" size="md" onClick={actions.resume} className="w-full">
                                        <Play size={16} aria-hidden="true" />
                                        Resume today
                                    </Button>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pause for">
                                        {PAUSES.map(([label, days]) => (
                                            <Button key={days} variant="ghost" size="sm" onClick={() => actions.pause(addDays(new Date(), days - 1))}>
                                                <Pause size={14} aria-hidden="true" />
                                                {label}
                                            </Button>
                                        ))}
                                        <DatePicker value={null} label="Pause until" onChange={(date) => { if (date) actions.pause(new Date(`${date}T00:00:00`)); }}>
                                            <button type="button" className={VALUE_BTN}>Until…</button>
                                        </DatePicker>
                                    </div>
                                )}
                                <p className="text-xs text-twilight-text-muted">A pause starts today. Days you already logged stay as they are.</p>
                            </DetailGroup>
                        )}
                    </section>
                ) : <PanelTrigger icon={SlidersHorizontal} title="Details" summary={[status, habit.targetTime, habit.reminderEnabled ? "Reminder on" : null].filter(Boolean).join(" · ")} onOpen={() => setSection("details")} />}

                {section === "history" ? (
                    <section className={`${CARD} space-y-4 px-4 py-3`}>
                        <PanelHeader title="History" onDone={() => setSection(null)} />
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="icon" onClick={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label="Previous month">
                                <ChevronLeft size={15} aria-hidden="true" />
                            </Button>
                            <span className="text-[13px] font-semibold tabular-nums text-twilight-text">{MONTH_NAMES[month.getMonth()]} {month.getFullYear()}</span>
                            <Button variant="ghost" size="icon" onClick={() => setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label="Next month">
                                <ChevronRight size={15} aria-hidden="true" />
                            </Button>
                        </div>
                        {historyMonth ? (
                            <RoutineMonthGrid habit={historyMonth} year={month.getFullYear()} month={month.getMonth()} weekStartsOn={weekStartsOn} today={today} bloom={bloom} />
                        ) : <div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />}
                        <dl className="space-y-2 text-sm">
                            {[["Total check-ins", habit.totalCompletions], ...(showStreaks ? [["Current run", habit.currentStreak], ["Longest run", habit.longestStreak]] : [])].map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-2"><dt className="text-twilight-text-muted">{label}</dt><dd className="text-twilight-text">{value}</dd></div>
                            ))}
                        </dl>
                        <p className="text-xs text-twilight-text-muted">Created {new Date(habit.createdAt).toLocaleDateString()}</p>
                    </section>
                ) : <PanelTrigger icon={CalendarDays} title="History" summary={showStreaks && habit.currentStreak > 0 ? `${habit.totalCompletions} check-ins · ${habit.currentStreak} in a row` : `${habit.totalCompletions} check-ins`} onOpen={() => setSection("history")} />}

                <Button variant="ghost" size="md" onClick={actions.toggleArchive}>
                    {habit.archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                    {habit.archived ? "Restore routine" : "Archive routine"}
                </Button>
                <Button variant="ghost" size="none" type="button" aria-label="Delete routine" onClick={actions.requestDelete} className={`${PANEL_TRIGGER} shrink-0 font-normal text-feedback-error`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-feedback-error/10"><Trash2 size={16} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Delete routine</span><span className="block text-xs text-twilight-text-muted">Permanently remove this routine and its history.</span></span>
                </Button>
            </DetailPanelLayout>
            {actions.deleteDialog}
        </div>
    );
}
