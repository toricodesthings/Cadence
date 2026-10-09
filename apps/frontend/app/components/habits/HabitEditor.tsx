import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as Popover from "../primitives/Popover";
import { addDays, weekdayOf, type LocalDate } from "@cadence/domain/time";
import { Archive, ArchiveRestore, Bell, CalendarClock, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, FolderOpen, ListChecks, Repeat2, Palette, Pause, Play, SlidersHorizontal, StickyNote, Tag, Target, Trash2 } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { useRoutineActions } from "../../hooks/habits/use-routine-actions";
import { useHabitsRange } from "../../hooks/habits/use-habits";
import { useProjects } from "../../hooks/projects/use-projects";
import { useSettings } from "../../hooks/core/use-settings";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { DetailTitle } from "../shared/DetailTitle";
import { CARD, PANEL_TRIGGER, PanelHeader, PanelTrigger, DetailGroup, FieldBlock, FieldRow, ValueSelect } from "../shared/DetailPanelSections";
import { Swatches } from "../shared/Swatches";
import { DatePicker } from "../shared/DatePicker";
import { TagField } from "../tasks/TagField";
import { CadencePicker } from "./CadencePicker";
import { DayTimes } from "./DayTimes";
import { RoutineDayCell } from "./RoutineDayCell";
import { RoutineMonthGrid } from "./RoutineMonthGrid";
import { RoutineStepChecklist, RoutineStepsEditor } from "./RoutineSteps";
import { listTimes, nextTime, RoutineTimeChecklist, RoutineTimes } from "./RoutineTimes";
import { logsByDay } from "./RoutineWeekRow";
import { Button } from "../primitives/Button";
import { Switch } from "../primitives/Switch";
import { TimePicker } from "../primitives/TimePicker";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { formatMonthYear, formatShortDate, formatTime, fromTimeValue, getMonthDateRange, getWeekDays, isoMonthStart, weekdayLabels, WEEK_START_INDEX } from "../../lib/utils/date-format";
import { today as todayDay, useToday } from "../../lib/utils/user-zone";
import { ROUTINE_DEFAULT_ACCENT, ROUTINE_SWATCHES, routineTone } from "../../lib/utils/habits";
import { RepeatKindPicker } from "../shared/RepeatKindPicker";
import { RoutineMark } from "./RoutineMark";
import { Reveal } from "../shared/Reveal";
import { useConvertRepeat } from "../../hooks/habits/use-convert-repeat";

const FIELD = "w-full min-w-0 rounded-xl border border-twilight-border/35 bg-white/[0.03] px-3 py-2.5 text-sm text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";
const PAUSES = [["3 days", 3], ["1 week", 7], ["2 weeks", 14]] as const;
const FIELD_CAPTION = "flex items-center gap-2 text-[13px] text-twilight-text-muted";
/** The time field as a borderless value, like the row's other values. */
const VALUE_TIME = "border-transparent! bg-transparent! px-0! transition-colors hover:bg-white/[0.06]! focus-within:bg-white/[0.06]! [&_input]:w-[5.5rem] [&_input]:text-right [&_input]:text-[13px] [&_input]:text-twilight-text-soft";
const MENU_ITEM = "flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

/** "Pause ▾": how long, from today. Sits beside Archive. */
function PauseMenu({ onPause }: { onPause: (until: LocalDate) => void }) {
    const [open, setOpen] = useState(false);
    const pause = (until: LocalDate) => { onPause(until); setOpen(false); };
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <Button variant="ghost" size="md">
                    <Pause size={16} aria-hidden="true" />
                    Pause
                    <ChevronDown size={14} aria-hidden="true" className="opacity-60" />
                </Button>
            </Popover.Trigger>
            <Popover.Content align="end" side="top" className="w-60 p-1.5" aria-label="Pause for">
                {PAUSES.map(([label, days]) => (
                    <button key={days} type="button" className={MENU_ITEM} onClick={() => pause(addDays(todayDay(), days - 1))}>{label}</button>
                ))}
                <DatePicker value={null} label="Pause until" onChange={(date) => { if (date) pause(date); }}>
                    <button type="button" className={MENU_ITEM}>Until a date…</button>
                </DatePicker>
                <p className="border-t border-twilight-border/30 px-2.5 pb-1 pt-2 text-xs text-twilight-text-muted">A pause starts today. Days you already logged stay.</p>
            </Popover.Content>
        </Popover.Root>
    );
}

function shiftMonth(day: LocalDate, delta: number): LocalDate {
    const index = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 + delta;
    return isoMonthStart(Math.floor(index / 12), index % 12);
}

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
    const [section, setSection] = useState<"notes" | "steps" | "details" | "history" | null>(habit.notes?.trim() || habit.description?.trim() ? "notes" : null);
    const [notes, setNotes] = useState(habit.notes ?? "");
    const [purpose, setPurpose] = useState(habit.description ?? "");
    const [month, setMonth] = useState<LocalDate>(() => isoMonthStart(Number(todayDay().slice(0, 4)), Number(todayDay().slice(5, 7)) - 1));
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

    const today = useToday();
    const week = useMemo(() => getWeekDays(today, weekStartsOn), [today, weekStartsOn]);
    const thisWeek = useRoutineInRange(habit, { start: week[0], end: week[6] });
    const weekLogs = logsByDay(thisWeek ?? habit);
    const historyMonth = useRoutineInRange(habit, getMonthDateRange(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1), section === "history");

    const status = habit.archived ? "Archived" : actions.isPaused ? `Paused until ${formatShortDate(habit.pausedUntil!)}` : "Active";
    const times = habit.times?.length ? habit.times : null;
    const routineSummary = times ? `${habit.recurrenceRule === "FREQ=DAILY" ? "Every day" : "Repeats"} at ${listTimes(times)}` : `${getTaskRecurrenceSummary({
        recurrenceRule: habit.recurrenceRule,
        scheduledStart: habit.targetTime ? fromTimeValue(today, habit.targetTime) : null,
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
                            {week.map((iso) => {
                                return (
                                    <div key={iso} className="flex flex-col items-center gap-1">
                                        <span aria-hidden="true" className={`text-[10px] font-semibold uppercase ${iso === today ? "text-[var(--routine-tone)]" : "text-twilight-text-muted"}`}>
                                            {weekdayLabels(1, 0)[weekdayOf(iso)]}
                                        </span>
                                        <RoutineDayCell size="sm" habit={habit} date={iso} log={weekLogs.get(iso)} today={today} bloom={bloom} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {times && !habit.archived && weekLogs.get(today) ? (
                        <div className="border-t border-twilight-border/30 pt-1">
                            <p className="pt-2 text-xs font-medium text-twilight-text-soft">Today's times</p>
                            <RoutineTimeChecklist habit={habit} date={today} log={weekLogs.get(today)} />
                        </div>
                    ) : null}
                    {habit.steps?.length && !habit.archived && weekLogs.get(today) ? (
                        <div className="border-t border-twilight-border/30 pt-1">
                            <p className="pt-2 text-xs font-medium text-twilight-text-soft">Today's steps</p>
                            <RoutineStepChecklist habit={habit} date={today} log={weekLogs.get(today)} />
                        </div>
                    ) : null}
                </div>

                {section !== "notes" ? <PanelTrigger icon={StickyNote} title="Notes" summary={purpose.trim() || notes.trim() || "Why it matters, reflections, context"} onOpen={() => setSection("notes")} /> : null}
                <Reveal open={section === "notes"}>
                    <section className={`${CARD} space-y-3 px-4 py-3`}>
                        <PanelHeader title="Notes" onDone={() => setSection(null)} />
                        <label className="flex flex-col gap-1.5">
                            <span className={FIELD_CAPTION}><Target size={14} className="opacity-80" aria-hidden="true" />Purpose</span>
                            <textarea aria-label="Routine purpose" rows={2} maxLength={10000} value={purpose} onChange={(e) => setPurpose(e.target.value)}
                                onBlur={() => { if (purpose !== (habit.description ?? "")) update({ description: purpose.trim() || null }); }}
                                placeholder="Why this routine matters to you…"
                                className={`${FIELD} resize-y`} />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className={FIELD_CAPTION}><StickyNote size={14} className="opacity-80" aria-hidden="true" />Notes</span>
                            <textarea aria-label="Routine notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)}
                                onBlur={() => { if (notes !== (habit.notes ?? "")) update({ notes: notes || null }); }}
                                placeholder="Reflections, intentions, context for this routine…"
                                className={`${FIELD} resize-y`} />
                        </label>
                    </section>
                </Reveal>

                {times ? null : section !== "steps" ? <PanelTrigger icon={ListChecks} title="Steps" summary={habit.steps?.length ? habit.steps.map((step) => step.title).join(" → ") : "Break it into a short sequence"} onOpen={() => setSection("steps")} /> : null}
                <Reveal open={!times && section === "steps"}>
                    <section className={`${CARD} space-y-1 px-4 py-3`}>
                        <PanelHeader title="Steps" onDone={() => setSection(null)} />
                        <RoutineStepsEditor steps={habit.steps ?? []} onChange={(steps) => update({ steps })} />
                        <p className="pt-1 text-xs text-twilight-text-muted">Tick or skip them one by one on any day. The day is done once every step is done or skipped.</p>
                    </section>
                </Reveal>

                {section !== "details" ? <PanelTrigger icon={SlidersHorizontal} title="Details" summary={[status, times ? listTimes(times) : habit.targetTime ? formatTime(fromTimeValue(today, habit.targetTime)) : null, habit.reminderEnabled ? "Reminder on" : null].filter(Boolean).join(" · ")} onOpen={() => setSection("details")} /> : null}
                <Reveal open={section === "details"}>
                    <section className={`${CARD} flex flex-col`}>
                        <div className="px-4 pb-1 pt-3"><PanelHeader title="Details" summary={status} onDone={() => setSection(null)} /></div>

                        <DetailGroup title="Rhythm">
                            <CadencePicker select value={habit.recurrenceRule} onChange={(recurrenceRule) => update({ recurrenceRule })} />
                            {times ? (
                                <FieldBlock icon={Clock3} label="Times">
                                    <RoutineTimes
                                        times={times}
                                        cadence={habit.recurrenceRule === "FREQ=DAILY" ? "Every day" : "Repeats"}
                                        onChange={(next) => update(next.length > 1 ? { times: next } : { times: null, targetTime: next[0] ?? habit.targetTime })}
                                    />
                                </FieldBlock>
                            ) : (
                                <>
                                <FieldRow icon={Clock3} label="Usual time">
                                    <TimePicker label="Routine usual time" value={habit.targetTime ?? ""} placeholder="Any time" clearable onChange={(value) => update({ targetTime: value || null })} className={VALUE_TIME} />
                                </FieldRow>
                                <FieldRow icon={CalendarClock} label="Times by day" hint="Different on some days">
                                    <Switch
                                        checked={dayTimesOpen}
                                        aria-label="Different times on some days"
                                        onCheckedChange={(on) => {
                                            setDayTimesOpen(on);
                                            if (!on && habit.targetTimes) update({ targetTimes: null }); // off means one time every day
                                        }}
                                    />
                                </FieldRow>
                                {dayTimesOpen ? <div className="pb-2 pl-6"><DayTimes value={habit.targetTimes} usualTime={habit.targetTime} onChange={(targetTimes) => update({ targetTimes })} /></div> : null}
                                </>
                            )}
                            <FieldRow icon={Repeat2} label="Several times a day" hint={habit.steps?.length && !times ? "Not with steps" : "Check off each time"}>
                                <Switch
                                    checked={Boolean(times)}
                                    disabled={Boolean(habit.steps?.length) && !times}
                                    aria-label="Several times a day"
                                    onCheckedChange={(on) => {
                                        // The usual time and times by day are kept underneath, so turning it off brings them back.
                                        const first = habit.targetTime ?? "09:00";
                                        update(on ? { times: [first, nextTime([first])] } : { times: null, targetTime: habit.targetTime ?? times?.[0] ?? null });
                                    }}
                                />
                            </FieldRow>
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
                        </DetailGroup>

                        <DetailGroup title="Kind">
                            <RepeatKindPicker
                                value="routine"
                                disabled={convertRepeat.isPending || Boolean(times)}
                                fixedUnavailableReason={habit.targetTime ? null : "Set a usual time to make it fixed."}
                                onChange={(kind) => {
                                    if (kind === "routine") return;
                                    void convertRepeat.routineToTask(habit, kind).then(onClose);
                                }}
                            />
                        </DetailGroup>

                    </section>
                </Reveal>

                {section !== "history" ? <PanelTrigger icon={CalendarDays} title="History" summary={showStreaks && habit.currentStreak > 0 ? `${habit.totalCompletions} check-ins · ${habit.currentStreak} in a row` : `${habit.totalCompletions} check-ins`} onOpen={() => setSection("history")} /> : null}
                <Reveal open={section === "history"}>
                    <section className={`${CARD} space-y-4 px-4 py-3`}>
                        <PanelHeader title="History" onDone={() => setSection(null)} />
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="icon" onClick={() => setMonth((d) => shiftMonth(d, -1))} aria-label="Previous month">
                                <ChevronLeft size={15} aria-hidden="true" />
                            </Button>
                            <span className="text-[13px] font-semibold tabular-nums text-twilight-text">{formatMonthYear(month)}</span>
                            <Button variant="ghost" size="icon" onClick={() => setMonth((d) => shiftMonth(d, 1))} aria-label="Next month">
                                <ChevronRight size={15} aria-hidden="true" />
                            </Button>
                        </div>
                        {historyMonth ? (
                            <RoutineMonthGrid habit={historyMonth} year={Number(month.slice(0, 4))} month={Number(month.slice(5, 7)) - 1} weekStartsOn={weekStartsOn} today={today} bloom={bloom} />
                        ) : <div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />}
                        <dl className="space-y-2 text-sm">
                            {[["Total check-ins", habit.totalCompletions], ...(showStreaks ? [["Current run", habit.currentStreak], ["Longest run", habit.longestStreak]] : [])].map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-2"><dt className="text-twilight-text-muted">{label}</dt><dd className="text-twilight-text">{value}</dd></div>
                            ))}
                        </dl>
                        <p className="text-xs text-twilight-text-muted">Created {formatShortDate(habit.createdAt)}</p>
                    </section>
                </Reveal>

                {habit.archived ? (
                    <Button variant="ghost" size="md" onClick={actions.toggleArchive}>
                        <ArchiveRestore size={16} aria-hidden="true" />
                        Restore routine
                    </Button>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="ghost" size="md" onClick={actions.toggleArchive}>
                            <Archive size={16} aria-hidden="true" />
                            Archive
                        </Button>
                        {actions.isPaused ? (
                            <Button variant="ghost" size="md" onClick={actions.resume}>
                                <Play size={16} aria-hidden="true" />
                                Resume today
                            </Button>
                        ) : <PauseMenu onPause={actions.pause} />}
                    </div>
                )}
                <Button variant="ghost" size="none" type="button" aria-label="Delete routine" onClick={actions.requestDelete} className={`${PANEL_TRIGGER} shrink-0 font-normal text-feedback-error`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-feedback-error/10"><Trash2 size={16} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Delete routine</span><span className="block text-xs text-twilight-text-muted">Permanently remove this routine and its history.</span></span>
                </Button>
            </DetailPanelLayout>
        </div>
    );
}
