import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CalendarHeart, Bell, BellOff, Trash2, ArrowDownUp, PencilLine } from "lucide-react";
import { toast } from "sonner";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import * as AlertDialog from "../components/primitives/AlertDialog";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { Button } from "../components/primitives/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/primitives/Select";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { PersonalEventEditorDialog } from "../components/events/PersonalEventEditorDialog";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import type { PersonalEvent } from "../types/settings";
import {
    getNextPersonalEventDate,
    sortPersonalEventViewModels,
    toPersonalEventViewModel,
    type PersonalEventSortMode,
    type PersonalEventViewModel,
} from "../lib/utils/personal-events";

function EventCard({
    item,
    onEdit,
    onDelete,
}: {
    item: PersonalEventViewModel;
    onEdit: (event: PersonalEvent) => void;
    onDelete: (event: PersonalEvent) => void;
}) {
    return (
        <div className="group rounded-[1.7rem] border border-white/[0.08] bg-white/[0.03] p-4 transition-[border-color,background-color,box-shadow] duration-200 hover:border-personal/18 hover:bg-white/[0.045] hover:shadow-[0_18px_44px_rgba(244,114,182,0.12)]">
            <div className="flex items-start justify-between gap-3">
                <button
                    type="button"
                    onClick={() => onEdit(item.event)}
                    className="flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl -m-2 p-2 text-left transition-colors hover:bg-white/[0.03]"
                >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-personal/20 bg-personal/12 text-xl text-personal">
                        {item.event.emoji ?? "🎉"}
                    </span>
                    <span className="min-w-0">
                        <span className="block line-clamp-2 text-[17px] font-bold tracking-[-0.01em] text-twilight-text">
                            {item.event.label}
                        </span>
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => onDelete(item.event)}
                    aria-label={`Delete ${item.event.label}`}
                    className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border border-transparent bg-transparent text-twilight-text-muted transition-colors hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-400"
                >
                    <Trash2 size={18} aria-hidden="true" />
                </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">Date</p>
                    <p className="mt-1 text-sm font-medium text-twilight-text">{item.monthDayLabel}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">Reminder</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-medium text-twilight-text">
                        {item.event.notify ? <Bell size={14} className="text-personal" aria-hidden="true" /> : <BellOff size={14} className="text-twilight-text-muted" aria-hidden="true" />}
                        <span>{item.event.notify ? "On" : "Off"}</span>
                    </p>
                </div>
            </div>

            <div className="mt-3 rounded-[1.35rem] border border-personal/16 bg-personal/10 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-personal/75">Countdown</p>
                <p className="mt-1 text-base font-semibold text-personal">{item.countdownLabel}</p>
                {item.milestoneLabel ? (
                    <p className="mt-1 text-xs font-medium text-personal/75">{item.milestoneLabel}</p>
                ) : null}
            </div>

            <div className="mt-3 flex items-center justify-end">
                <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => onEdit(item.event)}
                    className="px-4 text-sm font-semibold"
                >
                    <PencilLine size={16} aria-hidden="true" />
                    Edit
                </Button>
            </div>
        </div>
    );
}

export default function EventsRoute() {
    const navigate = useNavigate();
    const today = new Date();
    const currentYear = today.getFullYear();
    const personalEvents = usePersonalEvents(currentYear);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<PersonalEvent | null>(null);
    const [deletingEvent, setDeletingEvent] = useState<PersonalEvent | null>(null);
    const [sortMode, setSortMode] = useState<PersonalEventSortMode>("next");

    useDocumentMeta(
        "Events · Cadence",
        "Manage yearly recurring personal events in a simple, focused card view.",
    );

    useRouteFocus();

    const events = useMemo(
        () => sortPersonalEventViewModels(personalEvents.items.map((event) => toPersonalEventViewModel(event, today)), sortMode),
        [personalEvents.items, sortMode, today],
    );
    const nextScheduleDate = events[0]?.nextDate;

    const openCreate = () => {
        setEditingEvent(null);
        setEditorOpen(true);
    };

    const openEdit = (event: PersonalEvent) => {
        setEditingEvent(event);
        setEditorOpen(true);
    };

    const handleOpenSchedule = (date?: string) => {
        if (!date) {
            navigate("/schedule");
            return;
        }

        navigate(`/schedule?date=${date}&view=day`);
    };

    const handleSubmit = (value: Omit<PersonalEvent, "id">) => {
        if (editingEvent) {
            personalEvents.updateEvent(editingEvent.id, value);
            toast.success("Event updated");
        } else {
            personalEvents.addEvent(value);
            toast.success("Event added", {
                action: {
                    label: "Open Schedule",
                    onClick: () => handleOpenSchedule(getNextPersonalEventDate(value)),
                },
            });
        }

        setEditorOpen(false);
        setEditingEvent(null);
    };

    return (
        <MainLayout
            requireAuth
            contentWidth="full"
            shellHeader={{
                title: "Events",
                eyebrow: "Calendar",
                icon: <CalendarHeart size={18} aria-hidden="true" />,
                accentColor: "var(--color-personal)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="full" className="space-y-6">
                    <section className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                            <h1 className="font-display text-2xl font-semibold tracking-tight text-twilight-text">
                                Your Personal Events
                            </h1>
                            <p className="text-sm text-twilight-text-soft">
                                Yearly recurring dates that stay visible in Schedule.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:min-w-[20rem] sm:items-end">
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                                <Button type="button" variant="cardPrimary" size="md" onClick={openCreate} className="border-personal/30 bg-personal/14 text-personal hover:bg-personal/20">
                                    <CalendarHeart size={16} aria-hidden="true" />
                                    Add event
                                </Button>
                                <Button type="button" variant="ghost" size="md" onClick={() => handleOpenSchedule(nextScheduleDate)}>
                                    Open Schedule
                                </Button>
                            </div>
                            {events.length > 0 ? (
                                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                                    <span className="flex items-center gap-2 text-sm text-twilight-text-soft">
                                        <ArrowDownUp size={14} aria-hidden="true" />
                                        Sort
                                    </span>
                                    <Select
                                        value={sortMode}
                                        onValueChange={(value) => setSortMode(value as PersonalEventSortMode)}
                                    >
                                        <SelectTrigger className="min-h-10 min-w-[12rem] border-white/[0.08] bg-white/[0.04] focus:ring-personal/45">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="next">Next occurrence</SelectItem>
                                            <SelectItem value="month-day">Month and day</SelectItem>
                                            <SelectItem value="alphabetical">Alphabetical</SelectItem>
                                            <SelectItem value="reminders">Reminders first</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : null}
                        </div>
                    </section>

                    {events.length === 0 ? (
                        <section className="rounded-[1.9rem] border border-white/[0.08] bg-white/[0.03] px-6 py-16">
                            <div className="mx-auto flex max-w-md flex-col items-center text-center">
                                <div className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] border border-personal/20 bg-personal/10 text-personal">
                                    <CalendarHeart size={28} aria-hidden="true" />
                                </div>
                                <p className="mt-6 text-base font-medium text-twilight-text">
                                    No personal events yet.
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-twilight-text-soft">
                                    Add birthdays, anniversaries, and other yearly dates you want to keep in view.
                                </p>
                                <Button type="button" variant="cardPrimary" size="md" onClick={openCreate} className="mt-6 border-personal/30 bg-personal/14 text-personal hover:bg-personal/20">
                                    <CalendarHeart size={16} aria-hidden="true" />
                                    Add event
                                </Button>
                            </div>
                        </section>
                    ) : (
                        <section className="grid gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-3">
                            {events.map((item) => (
                                <EventCard
                                    key={item.event.id}
                                    item={item}
                                    onEdit={openEdit}
                                    onDelete={setDeletingEvent}
                                />
                            ))}
                        </section>
                    )}
                </PageContent>
            </ScrollAreaWrapper>

            <PersonalEventEditorDialog
                open={editorOpen}
                initialEvent={editingEvent}
                title={editingEvent ? "Edit personal event" : "Add personal event"}
                submitLabel={editingEvent ? "Save changes" : "Add event"}
                onClose={() => {
                    setEditorOpen(false);
                    setEditingEvent(null);
                }}
                onSubmit={handleSubmit}
                onDelete={editingEvent ? () => {
                    personalEvents.removeEvent(editingEvent.id);
                    toast.success("Event deleted");
                    setEditorOpen(false);
                    setEditingEvent(null);
                } : undefined}
            />

            <AlertDialog.Root open={Boolean(deletingEvent)} onOpenChange={(open) => { if (!open) setDeletingEvent(null); }}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete "{deletingEvent?.label}"?</AlertDialog.Title>
                        <AlertDialog.Description>
                            This event will be removed from your personal events library and from Schedule.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={() => {
                                    if (!deletingEvent) return;
                                    personalEvents.removeEvent(deletingEvent.id);
                                    toast.success("Event deleted");
                                    setDeletingEvent(null);
                                }}
                            >
                                Delete event
                            </Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </MainLayout>
    );
}
