import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CalendarHeart, CalendarPlus, ArrowDownUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { EventCard } from "../components/events/EventCard";
import * as AlertDialog from "../components/primitives/AlertDialog";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { Button } from "../components/primitives/Button";
import * as DropdownMenu from "../components/primitives/DropdownMenu";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { ContextualAddOrb } from "../components/shared/ContextualAddOrb";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRightPanelStore } from "../stores/right-panel-store";
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
} from "../lib/utils/personal-events";

const ADD_EVENT_CLASS = "border-accent-nav-schedule/30 bg-accent-nav-schedule/14 text-accent-nav-schedule hover:bg-accent-nav-schedule/20 font-sans font-medium";

const SORT_LABELS: Record<PersonalEventSortMode, string> = {
    next: "Next occurrence",
    "month-day": "Month and day",
    alphabetical: "Alphabetical",
    reminders: "Reminders first",
};

export default function EventsRoute() {
    const navigate = useNavigate();
    const shell = useShellMode();
    const setRailView = useRightPanelStore((s) => s.setRailView);
    const today = new Date();
    const currentYear = today.getFullYear();
    const personalEvents = usePersonalEvents(currentYear);

    const [editorOpen, setEditorOpen] = useState(false);
    const [searchParams] = useSearchParams();
    // ?event=<id> (from Today/Upcoming) opens that event's details.
    const [selectedEventId, setSelectedEventId] = useState<string | null>(() => searchParams.get("event"));
    const [detailMode, setDetailMode] = useState<"peek" | "focus">("peek");
    const editingEvent = personalEvents.items.find((event) => event.id === selectedEventId);
    const [deletingEvent, setDeletingEvent] = useState<PersonalEvent | null>(null);
    const [sortMode, setSortMode] = useState<PersonalEventSortMode>("next");

    useDocumentMeta(
        "Events · Cadence",
        "Manage yearly recurring personal events in a simple, focused card view.",
    );

    useRouteFocus();

    useEffect(() => {
        if (searchParams.get("event")) setRailView("context");
    }, [searchParams, setRailView]);

    const events = useMemo(
        () => sortPersonalEventViewModels(personalEvents.items.map((event) => toPersonalEventViewModel(event, today)), sortMode),
        [personalEvents.items, sortMode, today],
    );

    const openCreate = () => {
        setSelectedEventId(null);
        setEditorOpen(true);
    };

    const openEdit = (event: PersonalEvent) => {
        setSelectedEventId(event.id);
        setDetailMode("peek");
        setRailView("context");
    };

    const handleOpenSchedule = (date?: string) => {
        if (!date) {
            navigate("/schedule");
            return;
        }

        navigate(`/schedule?date=${date}&view=day`);
    };

    const handleSubmit = (value: Omit<PersonalEvent, "id">) => {
        personalEvents.addEvent(value);
        toast.success("Event added", {
            action: { label: "Open Schedule", onClick: () => handleOpenSchedule(getNextPersonalEventDate(value)) },
        });

        setEditorOpen(false);
        setSelectedEventId(null);
    };

    const closeDetails = () => setSelectedEventId(null);
    const detailPanel = editingEvent ? (
        <EditSidePanel kind="event"
            key={editingEvent.id}
            event={editingEvent}
            onChange={(patch) => personalEvents.updateEvent(editingEvent.id, patch)}
            onClose={closeDetails}
            onDelete={() => setDeletingEvent(editingEvent)}
            detailMode={detailMode}
            onDetailModeChange={shell.isWide ? undefined : setDetailMode}
        />
    ) : null;

    return (
        <MainLayout
            requireAuth
            sidePanel={<EditSidePanelRail ariaLabel="Resize event details">{shell.isWide ? detailPanel : null}</EditSidePanelRail>}
            sidePanelActive={Boolean(editingEvent)}
            sidePanelLabel="Event"
            onCloseSidePanel={closeDetails}
            compactHeaderRightInline
            hideContextualOrb={shell.isCompact}
            headerRight={shell.isCompact ? undefined : (
                <Button type="button" variant="cardPrimary" size="md" onClick={openCreate} aria-label="Add event" className={ADD_EVENT_CLASS}>
                    <CalendarPlus size={16} aria-hidden="true" />
                    <span className="hidden sm:inline">Add event</span>
                </Button>
            )}
            shellHeader={{
                title: "Events",
                eyebrow: "Calendar",
                icon: <CalendarHeart size={18} aria-hidden="true" />,
                accentColor: "var(--accent-nav-schedule, var(--accent-primary))",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="full" className="space-y-6">
                    <section className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between">
                        <div className="space-y-1">
                            <h1 className="font-display text-2xl font-semibold tracking-tight text-twilight-text">
                                Your Personal Events
                            </h1>
                            <p className="text-sm text-twilight-text-soft">
                                Yearly recurring dates that stay visible in Schedule.
                            </p>
                        </div>

                        {events.length > 0 ? (
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <button
                                        type="button"
                                        aria-label={`Sort events: ${SORT_LABELS[sortMode]}`}
                                        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 self-start rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 text-[13px] text-twilight-text-soft transition-colors hover:bg-accent-nav-schedule/8 hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-nav-schedule/40 data-[state=open]:text-twilight-text sm:self-auto"
                                    >
                                        <ArrowDownUp size={13} aria-hidden="true" className="text-accent-nav-schedule" />
                                        {SORT_LABELS[sortMode]}
                                        <ChevronDown size={14} aria-hidden="true" className="text-twilight-text-muted" />
                                    </button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Content align="end" aria-label="Sort events">
                                    <DropdownMenu.RadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as PersonalEventSortMode)}>
                                        {(Object.keys(SORT_LABELS) as PersonalEventSortMode[]).map((value) => (
                                            <DropdownMenu.RadioItem key={value} value={value}>{SORT_LABELS[value]}</DropdownMenu.RadioItem>
                                        ))}
                                    </DropdownMenu.RadioGroup>
                                </DropdownMenu.Content>
                            </DropdownMenu.Root>
                        ) : null}
                    </section>

                    {events.length === 0 ? (
                        <section className="rounded-[1.9rem] border border-white/[0.08] bg-white/[0.03] px-6 py-16">
                            <div className="mx-auto flex max-w-md flex-col items-center text-center">
                                <div className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] border border-accent-nav-schedule/20 bg-accent-nav-schedule/10 text-accent-nav-schedule">
                                    <CalendarHeart size={28} aria-hidden="true" />
                                </div>
                                <p className="mt-6 text-base font-medium text-twilight-text">
                                    No personal events yet.
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-twilight-text-soft">
                                    Add birthdays, anniversaries, and other yearly dates you want to keep in view.
                                </p>
                                <Button type="button" variant="cardPrimary" size="md" onClick={openCreate} className={`mt-6 ${ADD_EVENT_CLASS}`}>
                                    <CalendarPlus size={16} aria-hidden="true" />
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
                                    onToggleReminder={(event) => {
                                        personalEvents.updateEvent(event.id, { ...event, notify: !event.notify });
                                        toast.success(event.notify ? "Reminder disabled" : "Reminder enabled");
                                    }}
                                    onOpenInSchedule={(event) => {
                                        handleOpenSchedule(getNextPersonalEventDate(event));
                                    }}
                                />
                            ))}
                        </section>
                    )}
                </PageContent>
            </ScrollAreaWrapper>

            {!shell.isWide && detailPanel ? (
                <ResponsiveOverlayPanel ariaLabel="Event details" open onClose={closeDetails} mode={detailMode} fill>
                    {detailPanel}
                </ResponsiveOverlayPanel>
            ) : null}

            {shell.isCompact ? <ContextualAddOrb directCapture directLabel="Add event" onOpen={openCreate} /> : null}

            <PersonalEventEditorDialog
                open={editorOpen}
                title="Add personal event"
                submitLabel="Add event"
                onClose={() => setEditorOpen(false)}
                onSubmit={handleSubmit}
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
                                    if (selectedEventId === deletingEvent.id) closeDetails();
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
