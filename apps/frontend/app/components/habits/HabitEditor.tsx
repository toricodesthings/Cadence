import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, CalendarDays, Flame, Pause, Play, SlidersHorizontal, StickyNote, Trash2 } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
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

    return (
        <div className="h-full min-w-0 overflow-hidden" role="complementary" aria-label="Habit details">
            <DetailPanelLayout title="Habit" mode={detailMode} onModeChange={onDetailModeChange} onClose={onClose} closeLabel="Close habit details" leading={<Flame size={20} className="text-accent-primary" aria-hidden="true" />}>
                <DetailTitle value={habit.title} label="Habit title" maxLength={255} onSave={(title) => updateHabit.mutate({ id: habit.id, title })} />
                {section === "notes" ? (
                    <section className={`${CARD} space-y-3 px-4 py-3`}>
                        <PanelHeader title="Notes" onDone={() => setSection(null)} />
                        <textarea aria-label="Habit notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)}
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
                            <textarea aria-label="Habit purpose" rows={3} maxLength={10000} value={purpose} onChange={(e) => setPurpose(e.target.value)}
                                onBlur={() => { if (purpose !== (habit.description ?? "")) updateHabit.mutate({ id: habit.id, description: purpose.trim() || null }); }}
                                className={`${FIELD} resize-y`} />
                        </label>
                        <div className="space-y-2" role="group" aria-label="Cadence">
                            <p className="text-sm text-twilight-text-muted">Cadence</p>
                            <CadencePicker value={habit.recurrenceRule} onChange={(recurrenceRule) => updateHabit.mutate({ id: habit.id, recurrenceRule })} />
                        </div>
                        <label className="block space-y-2 text-sm text-twilight-text-muted">
                            <span>Target time</span>
                            <input type="time" aria-label="Habit target time" value={habit.targetTime ?? ""} className={FIELD}
                                onChange={(e) => updateHabit.mutate({ id: habit.id, targetTime: e.target.value || null })} />
                        </label>
                        {habit.targetTime ? <Button variant="ghost" size="sm" onClick={() => updateHabit.mutate({ id: habit.id, targetTime: null })}>Clear time</Button> : null}
                        <div className="flex items-center justify-between gap-3 text-sm text-twilight-text">
                            <span>Reminder</span>
                            <Switch checked={habit.reminderEnabled} aria-label="Habit reminder" onCheckedChange={(reminderEnabled) => updateHabit.mutate({ id: habit.id, reminderEnabled })} />
                        </div>
                        <label className="block space-y-2 text-sm text-twilight-text-muted">
                            <span>Project</span>
                            <select aria-label="Habit project" value={habit.projectId ?? ""} onChange={(e) => updateHabit.mutate({ id: habit.id, projectId: e.target.value || null })} className={`${FIELD} cursor-pointer`}>
                                <option value="">No project</option>
                                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                            </select>
                        </label>
                        {habitTags.length ? <div className="space-y-2"><p className="text-sm text-twilight-text-muted">Tags</p><div className="flex flex-wrap gap-2">{habitTags.map((tag) => <span key={tag.id} className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-twilight-text-muted">{tag.name}</span>)}</div></div> : null}
                        {isPaused && habit.pausedUntil ? <p className="text-xs text-twilight-text-muted">Paused until {habit.pausedUntil}</p> : null}
                        <Button variant="ghost" size="md" onClick={() => isPaused ? resume(habit.id) : pause(habit.id)} className="w-full">
                            {isPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
                            {isPaused ? "Resume habit" : "Pause for 7 days"}
                        </Button>
                    </section>
                ) : <PanelTrigger icon={SlidersHorizontal} title="Details" summary={[status, habit.targetTime, habit.reminderEnabled ? "Reminder on" : null].filter(Boolean).join(" · ")} onOpen={() => setSection("details")} />}

                {section === "history" ? (
                    <section className={`${CARD} space-y-4 px-4 py-3`}>
                        <PanelHeader title="History" onDone={() => setSection(null)} />
                        <HabitHistoryCalendar habitId={habit.id} year={month.getFullYear()} month={month.getMonth()} onNavigate={(delta) => setMonth((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1))} />
                        <dl className="space-y-2 text-sm">
                            {[["Total check-ins", habit.totalCompletions], ["Current streak", habit.currentStreak], ["Longest streak", habit.longestStreak]].map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-2"><dt className="text-twilight-text-muted">{label}</dt><dd className="text-twilight-text">{value}</dd></div>
                            ))}
                        </dl>
                        <p className="text-xs text-twilight-text-muted">Created {new Date(habit.createdAt).toLocaleDateString()}</p>
                    </section>
                ) : <PanelTrigger icon={CalendarDays} title="History" summary={`${habit.totalCompletions} check-ins · ${habit.currentStreak} day streak`} onOpen={() => setSection("history")} />}

                <Button variant="ghost" size="md" onClick={() => { updateHabit.mutate({ id: habit.id, archived: !habit.archived }); onClose(); }}>
                    {habit.archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                    {habit.archived ? "Restore habit" : "Archive habit"}
                </Button>
                <Button variant="ghost" size="none" type="button" aria-label="Delete habit" onClick={() => setDeleteOpen(true)} className={`${PANEL_TRIGGER} shrink-0 font-normal text-feedback-error`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-feedback-error/10"><Trash2 size={16} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Delete habit</span><span className="block text-xs text-twilight-text-muted">Permanently remove this habit and its history.</span></span>
                </Button>
            </DetailPanelLayout>
            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header><AlertDialog.Title>Delete "{habit.title}"?</AlertDialog.Title><AlertDialog.Description>All history and logs for this habit will be permanently removed. This cannot be undone.</AlertDialog.Description></AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild><Button variant="ghost" size="md">Cancel</Button></AlertDialog.Cancel>
                        <AlertDialog.Action asChild><Button variant="danger" size="md" onClick={() => { deleteHabit.mutate(habit.id); onClose(); }}>Delete habit</Button></AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </div>
    );
}
