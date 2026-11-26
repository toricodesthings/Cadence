import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
    ArrowDownAZ,
    Bell,
    CalendarDays,
    CalendarHeart,
    CalendarPlus,
    EllipsisVertical,
    LayoutGrid,
    LayoutList,
    Timer,
    type LucideIcon,
} from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { EventCard, type EventActions } from "../components/events/EventCard";
import { EventList } from "../components/events/EventList";
import { EventsSkeleton } from "../components/events/EventsSkeleton";
import { ClaimHeaderMenu, LayoutScaleMenuRow } from "../components/layout/LayoutScaleMenu";
import { HEADER_ICON_BUTTON } from "../components/layout/PageHeader";
import { Tip } from "../components/primitives/Tooltip";
import { useDeviceValue } from "../hooks/ui/use-device-flag";
import { MainLayout } from "../components/layout/MainLayout";
import { PageContent } from "../components/layout/PageLayout";
import { Button } from "../components/primitives/Button";
import * as DropdownMenu from "../components/primitives/DropdownMenu";
import { MENU_SEGMENT } from "../components/primitives/menu-styles";
import { SegmentedControl } from "../components/primitives/SegmentedControl";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { ContextualAddOrb } from "../components/shared/ContextualAddOrb";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRightPanelStore } from "../stores/right-panel-store";
import { PersonalEventEditorDialog } from "../components/events/PersonalEventEditorDialog";
import { ShareEventSheet } from "../components/sharing/ShareEventSheet";
import { ConfirmDanger } from "../components/shared/ConfirmDanger";
import { useToday } from "../lib/utils/user-zone";
import { cn } from "../lib/utils";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { useEventPeople, useRemoveFromMyEvents } from "../hooks/sharing/use-share-event";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import type { PersonalEvent } from "@cadence/contracts/personal-event";
import {
    getNextPersonalEventDate,
    sortPersonalEventViewModels,
    toPersonalEventViewModel,
    type MaybeSharedEvent,
    type PersonalEventSortMode,
    type PersonalEventView,
} from "../lib/utils/personal-events";

const ADD_EVENT_CLASS =
    "border-accent-nav-schedule/30 bg-accent-nav-schedule/14 text-accent-nav-schedule hover:bg-accent-nav-schedule/20 font-sans font-medium";

const SORTS: { value: PersonalEventSortMode; label: string; icon: LucideIcon }[] = [
    { value: "next", label: "Next occurrence", icon: Timer },
    { value: "month-day", label: "Month and day", icon: CalendarDays },
    { value: "alphabetical", label: "Name", icon: ArrowDownAZ },
    { value: "reminders", label: "Reminders first", icon: Bell },
];
const VIEWS = [
    { value: "cards", label: "Cards", icon: <LayoutGrid size={14} aria-hidden="true" /> },
    { value: "list", label: "List", icon: <LayoutList size={14} aria-hidden="true" /> },
] as const satisfies readonly { value: PersonalEventView; label: string; icon: React.ReactNode }[];

type EventsMenuProps = {
    view: PersonalEventView;
    onViewChange: (view: PersonalEventView) => void;
    sort: PersonalEventSortMode;
    onSortChange: (sort: PersonalEventSortMode) => void;
};

function EventsMenu({ view, onViewChange, sort, onSortChange }: EventsMenuProps) {
    return (
        <>
            <ClaimHeaderMenu />
            <DropdownMenu.Root>
                <Tip label="View and sort" side="bottom">
                    <DropdownMenu.Trigger asChild>
                        <button type="button" aria-label="Event view and sort options" className={HEADER_ICON_BUTTON}>
                            <EllipsisVertical size={18} aria-hidden="true" />
                        </button>
                    </DropdownMenu.Trigger>
                </Tip>
                <DropdownMenu.Content align="end" className="min-w-[15rem]">
                    <DropdownMenu.Label>View</DropdownMenu.Label>
                    <div className={MENU_SEGMENT}>
                        <SegmentedControl
                            ariaLabel="Event view"
                            className="flex w-full [&>button]:flex-1"
                            value={view}
                            onChange={onViewChange}
                            options={VIEWS}
                        />
                    </div>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Label>Sort by</DropdownMenu.Label>
                    {SORTS.map((option) => (
                        <DropdownMenu.CheckItem
                            key={option.value}
                            icon={option.icon}
                            label={option.label}
                            checked={sort === option.value}
                            onSelect={() => onSortChange(option.value)}
                        />
                    ))}
                    <LayoutScaleMenuRow />
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </>
    );
}

function EventsBadge() {
    return (
        <div className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] border border-accent-nav-schedule/20 bg-accent-nav-schedule/10 text-accent-nav-schedule">
            <CalendarHeart size={28} aria-hidden="true" />
        </div>
    );
}

type EmptyEventsProps = { onAdd: () => void };

function EmptyEvents({ onAdd }: EmptyEventsProps) {
    return (
        <section className="rounded-[1.9rem] border border-white/[0.08] bg-white/[0.03] px-6 py-16">
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
                <EventsBadge />
                <p className="mt-6 text-base font-medium text-twilight-text">No personal events yet.</p>
                <p className="mt-2 text-sm leading-relaxed text-twilight-text-soft">
                    Add birthdays, anniversaries, and other yearly dates you want to keep in view.
                </p>
                <Button
                    type="button"
                    variant="cardPrimary"
                    size="md"
                    onClick={onAdd}
                    className={cn("mt-6", ADD_EVENT_CLASS)}
                >
                    <CalendarPlus size={16} aria-hidden="true" />
                    Add event
                </Button>
            </div>
        </section>
    );
}

function AddEventButton({ onAdd }: EmptyEventsProps) {
    return (
        <Button
            type="button"
            variant="cardPrimary"
            size="md"
            onClick={onAdd}
            aria-label="Add event"
            className={ADD_EVENT_CLASS}
        >
            <CalendarPlus size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Add event</span>
        </Button>
    );
}

type EventsBodyProps = EventActions & {
    events: ReturnType<typeof sortPersonalEventViewModels>;
    isLoading: boolean;
    view: PersonalEventView;
    sort: React.ComponentProps<typeof EventList>["sort"];
    today: string;
    stacked: boolean;
    selectedEventId: string | null;
    onAdd: () => void;
    onRename: (event: MaybeSharedEvent, label: string) => void;
};

function EventsBody({
    events,
    isLoading,
    view,
    sort,
    today,
    stacked,
    selectedEventId,
    onAdd,
    onOpen,
    onEdit,
    onShare,
    onDelete,
    onRemoveFromMyEvents,
    onToggleReminder,
    onOpenInSchedule,
    onRename,
}: EventsBodyProps) {
    if (isLoading) return <EventsSkeleton view={view} stacked={stacked} />;
    if (events.length === 0) return <EmptyEvents onAdd={onAdd} />;
    if (view === "list") {
        return (
            <section className="pb-8">
                <EventList
                    events={events}
                    sort={sort}
                    today={today}
                    stacked={stacked}
                    selectedEventId={selectedEventId}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    onShare={onShare}
                    onDelete={onDelete}
                    onRemoveFromMyEvents={onRemoveFromMyEvents}
                    onToggleReminder={onToggleReminder}
                    onOpenInSchedule={onOpenInSchedule}
                />
            </section>
        );
    }
    return (
        <section className="grid gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((item) => (
                <EventCard
                    key={item.event.id}
                    item={item}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    onShare={onShare}
                    onDelete={onDelete}
                    onRemoveFromMyEvents={onRemoveFromMyEvents}
                    onToggleReminder={onToggleReminder}
                    onOpenInSchedule={onOpenInSchedule}
                    onRename={onRename}
                />
            ))}
        </section>
    );
}

function eventsViewOf(savedSort: unknown, savedView: unknown) {
    const sortMode = SORTS.find((option) => option.value === savedSort)?.value ?? "next";
    const view: PersonalEventView = savedView === "list" ? "list" : "cards";
    return { sortMode, view };
}

export default function EventsRoute() {
    const navigate = useNavigate();
    const shell = useShellMode();
    const setRailView = useRightPanelStore((s) => s.setRailView);
    const today = useToday();
    const currentYear = Number(today.slice(0, 4));
    const personalEvents = usePersonalEvents(currentYear);

    const [editorOpen, setEditorOpen] = useState(false);
    const [sharingEventId, setSharingEventId] = useState<string | null>(null);
    const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<MaybeSharedEvent | null>(null);
    const [confirmLeaveEvent, setConfirmLeaveEvent] = useState<MaybeSharedEvent | null>(null);
    const [searchParams] = useSearchParams();
    const [selectedEventId, setSelectedEventId] = useState<string | null>(() => searchParams.get("event"));
    const [detailMode, setDetailMode] = useState<"peek" | "focus">("peek");
    const editingEvent = personalEvents.items.find((event) => event.id === selectedEventId);
    const sharingEvent = personalEvents.items.find((event) => event.id === sharingEventId);
    const removeFromMyEvents = useRemoveFromMyEvents();
    const { data: confirmPeople } = useEventPeople(confirmDeleteEvent ?? confirmLeaveEvent ?? undefined);
    const [savedSort, setSavedSort] = useDeviceValue("cadence:events:sort");
    const [savedView, setSavedView] = useDeviceValue("cadence:events:view");
    const { sortMode, view } = eventsViewOf(savedSort, savedView);

    useRouteFocus();

    useEffect(() => {
        if (searchParams.get("event")) setRailView("context");
    }, [searchParams, setRailView]);

    const events = useMemo(
        () =>
            sortPersonalEventViewModels(
                personalEvents.items.map((event) => toPersonalEventViewModel(event, today)),
                sortMode,
            ),
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

    const toggleEdit = (event: PersonalEvent) => {
        if (event.id === selectedEventId) setSelectedEventId(null);
        else openEdit(event);
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

        setEditorOpen(false);
        setSelectedEventId(null);
    };

    const closeDetails = () => setSelectedEventId(null);
    const toggleReminder = (event: MaybeSharedEvent) => personalEvents.updateEvent(event.id, { notify: !event.notify });

    const commitDeleteEvent = (event: MaybeSharedEvent) => {
        personalEvents.removeEvent(event.id);
        if (selectedEventId === event.id) closeDetails();
    };
    const deleteEvent = (event: MaybeSharedEvent) => {
        if ((event.access ?? "owner") === "owner" && (event.members?.length ?? 0) > 0) {
            setConfirmDeleteEvent(event);
            return;
        }
        commitDeleteEvent(event);
    };
    const handleRemoveFromMyEvents = (event: MaybeSharedEvent) => setConfirmLeaveEvent(event);
    const commitRemoveFromMyEvents = (event: MaybeSharedEvent) => {
        removeFromMyEvents.mutate({ eventId: event.id, label: event.label });
        if (selectedEventId === event.id) closeDetails();
    };
    const detailPanel = editingEvent ? (
        <EditSidePanel
            kind="event"
            key={editingEvent.id}
            event={editingEvent}
            onChange={(patch) => personalEvents.updateEvent(editingEvent.id, patch)}
            onClose={closeDetails}
            onShare={() => setSharingEventId(editingEvent.id)}
            onDelete={() => deleteEvent(editingEvent)}
            onRemoveFromMyEvents={() => handleRemoveFromMyEvents(editingEvent)}
            detailMode={detailMode}
            onDetailModeChange={shell.isWide ? undefined : setDetailMode}
        />
    ) : null;

    return (
        <MainLayout
            requireAuth
            sidePanel={
                <EditSidePanelRail ariaLabel="Resize event details">
                    {shell.isWide ? detailPanel : null}
                </EditSidePanelRail>
            }
            sidePanelActive={Boolean(editingEvent)}
            sidePanelLabel="Event"
            onCloseSidePanel={closeDetails}
            compactHeaderRightInline
            hideContextualOrb={shell.isCompact}
            headerRight={
                <div className="flex items-center gap-2">
                    {shell.isCompact ? null : <AddEventButton onAdd={openCreate} />}
                    {events.length > 0 ? (
                        <EventsMenu
                            view={view}
                            onViewChange={setSavedView}
                            sort={sortMode}
                            onSortChange={setSavedSort}
                        />
                    ) : null}
                </div>
            }
            shellHeader={{
                title: "Events",
                icon: <CalendarHeart size={18} aria-hidden="true" />,
                accentColor: "var(--accent-nav-schedule, var(--accent-primary))",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="full" className="space-y-6">
                    <h1 className="sr-only">Events</h1>

                    <EventsBody
                        events={events}
                        isLoading={personalEvents.isLoading}
                        view={view}
                        sort={sortMode}
                        today={today}
                        stacked={shell.isCompact}
                        selectedEventId={selectedEventId}
                        onAdd={openCreate}
                        onOpen={toggleEdit}
                        onEdit={openEdit}
                        onShare={(event) => setSharingEventId(event.id)}
                        onDelete={deleteEvent}
                        onRemoveFromMyEvents={handleRemoveFromMyEvents}
                        onToggleReminder={toggleReminder}
                        onOpenInSchedule={(event) => handleOpenSchedule(getNextPersonalEventDate(event))}
                        onRename={(event, label) => personalEvents.updateEvent(event.id, { label })}
                    />
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

            {sharingEvent ? (
                <ShareEventSheet
                    event={sharingEvent}
                    open={Boolean(sharingEvent)}
                    onOpenChange={(open) => !open && setSharingEventId(null)}
                />
            ) : null}

            <ConfirmDanger
                trigger={null}
                open={Boolean(confirmDeleteEvent || confirmLeaveEvent)}
                onOpenChange={(open) => {
                    if (open) return;
                    setConfirmDeleteEvent(null);
                    setConfirmLeaveEvent(null);
                }}
                title={confirmLeaveEvent ? "Remove from your events?" : "Delete for everyone?"}
                description={(() => {
                    if (confirmLeaveEvent) {
                        const owner = confirmPeople?.find((p) => p.role === "owner")?.name ?? "its owner";
                        return `It leaves your calendar. To add it back, you'll need a new link from ${owner}.`;
                    }
                    const member = confirmPeople?.find((p) => p.role !== "owner");
                    if (confirmDeleteEvent && (confirmDeleteEvent.members?.length ?? 0) === 1 && member?.name) {
                        return `${member.name} won't see it anymore either.`;
                    }
                    return "Everyone it's shared with won't see it anymore either.";
                })()}
                confirmLabel={confirmLeaveEvent ? "Remove" : "Delete"}
                onConfirm={() => {
                    if (confirmLeaveEvent) commitRemoveFromMyEvents(confirmLeaveEvent);
                    else if (confirmDeleteEvent) commitDeleteEvent(confirmDeleteEvent);
                    setConfirmDeleteEvent(null);
                    setConfirmLeaveEvent(null);
                }}
            />
        </MainLayout>
    );
}
