import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowDownAZ, ArrowUpDown, Bell, CalendarDays, CalendarHeart, CalendarPlus, Check, EllipsisVertical, Eye, LayoutGrid, LayoutList, Timer, type LucideIcon } from "lucide-react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { EventCard } from "../components/events/EventCard";
import { EventList } from "../components/events/EventList";
import { ClaimHeaderMenu, LayoutScaleMenuRow } from "../components/layout/LayoutScaleMenu";
import { HEADER_ICON_BUTTON } from "../components/layout/PageHeader";
import { Tip } from "../components/primitives/Tooltip";
import { useDeviceValue } from "../hooks/ui/use-device-flag";
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
import { useToday } from "../lib/utils/user-zone";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import type { PersonalEvent } from "../types/settings";
import {
    getNextPersonalEventDate,
    sortPersonalEventViewModels,
    toPersonalEventViewModel,
    type PersonalEventSortMode,
    type PersonalEventView,
} from "../lib/utils/personal-events";

const ADD_EVENT_CLASS = "border-accent-nav-schedule/30 bg-accent-nav-schedule/14 text-accent-nav-schedule hover:bg-accent-nav-schedule/20 font-sans font-medium";

const SORTS: { value: PersonalEventSortMode; label: string; icon: LucideIcon }[] = [
    { value: "next", label: "Next occurrence", icon: Timer },
    { value: "month-day", label: "Month and day", icon: CalendarDays },
    { value: "alphabetical", label: "Name", icon: ArrowDownAZ },
    { value: "reminders", label: "Reminders first", icon: Bell },
];
const VIEWS: { value: PersonalEventView; label: string; icon: LucideIcon }[] = [
    { value: "cards", label: "Cards", icon: LayoutGrid },
    { value: "list", label: "List", icon: LayoutList },
];
const MENU_LABEL = "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-twilight-text-muted";

type ChoiceRowProps = { icon: LucideIcon; label: string; checked: boolean; onSelect: () => void };

/** A checkable menu row; the chosen one carries the check. */
function ChoiceRow({ icon: Icon, label, checked, onSelect }: ChoiceRowProps) {
    return (
        <DropdownMenu.Item onSelect={onSelect} className="flex items-center gap-2">
            <Icon size={14} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {checked ? <Check size={14} className="text-accent-primary" aria-hidden="true" /> : null}
        </DropdownMenu.Item>
    );
}

type EventsMenuProps = {
    view: PersonalEventView;
    onViewChange: (view: PersonalEventView) => void;
    sort: PersonalEventSortMode;
    onSortChange: (sort: PersonalEventSortMode) => void;
};

/** The page's ⋮: how events show and in what order. Both stay on this device, like every view choice. */
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
                    <div className={MENU_LABEL}><Eye size={11} aria-hidden="true" />View</div>
                    {VIEWS.map((option) => (
                        <ChoiceRow key={option.value} icon={option.icon} label={option.label} checked={view === option.value} onSelect={() => onViewChange(option.value)} />
                    ))}
                    <DropdownMenu.Separator />
                    <div className={MENU_LABEL}><ArrowUpDown size={11} aria-hidden="true" />Sort by</div>
                    {SORTS.map((option) => (
                        <ChoiceRow key={option.value} icon={option.icon} label={option.label} checked={sort === option.value} onSelect={() => onSortChange(option.value)} />
                    ))}
                    <LayoutScaleMenuRow />
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </>
    );
}

type EmptyEventsProps = { onAdd: () => void };

function EmptyEvents({ onAdd }: EmptyEventsProps) {
    return (
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
                <Button type="button" variant="cardPrimary" size="md" onClick={onAdd} className={`mt-6 ${ADD_EVENT_CLASS}`}>
                    <CalendarPlus size={16} aria-hidden="true" />
                    Add event
                </Button>
            </div>
        </section>
    );
}

type EventsBodyProps = {
    events: ReturnType<typeof sortPersonalEventViewModels>;
    view: PersonalEventView;
    sort: React.ComponentProps<typeof EventList>["sort"];
    today: string;
    stacked: boolean;
    selectedEventId: string | null;
    onAdd: () => void;
    onOpen: (event: PersonalEvent) => void;
    onEdit: (event: PersonalEvent) => void;
    onDelete: (event: PersonalEvent) => void;
    onToggleReminder: (event: PersonalEvent) => void;
    onOpenInSchedule: (event: PersonalEvent) => void;
};

/** The events as a list or as cards; the first-event invitation when there are none. */
function EventsBody({ events, view, sort, today, stacked, selectedEventId, onAdd, onOpen, onEdit, onDelete, onToggleReminder, onOpenInSchedule }: EventsBodyProps) {
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
                    onDelete={onDelete}
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
                    onDelete={onDelete}
                    onToggleReminder={onToggleReminder}
                    onOpenInSchedule={onOpenInSchedule}
                />
            ))}
        </section>
    );
}

/** The device's saved order and view; unknown values fall back to next occurrence and cards. */
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
    const [searchParams] = useSearchParams();
    // ?event=<id> (from Today/Upcoming) opens that event's details.
    const [selectedEventId, setSelectedEventId] = useState<string | null>(() => searchParams.get("event"));
    const [detailMode, setDetailMode] = useState<"peek" | "focus">("peek");
    const editingEvent = personalEvents.items.find((event) => event.id === selectedEventId);
    // View and order are this device's (a phone may want the list, a desk the cards); unknown values fall back.
    const [savedSort, setSavedSort] = useDeviceValue("cadence:events:sort");
    const [savedView, setSavedView] = useDeviceValue("cadence:events:view");
    const { sortMode, view } = eventsViewOf(savedSort, savedView);


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
    const toggleReminder = (event: PersonalEvent) => personalEvents.updateEvent(event.id, { ...event, notify: !event.notify });

    const deleteEvent = (event: PersonalEvent) => {
        personalEvents.removeEvent(event.id);
        if (selectedEventId === event.id) closeDetails();
    };
    const detailPanel = editingEvent ? (
        <EditSidePanel kind="event"
            key={editingEvent.id}
            event={editingEvent}
            onChange={(patch) => personalEvents.updateEvent(editingEvent.id, patch)}
            onClose={closeDetails}
            onDelete={() => deleteEvent(editingEvent)}
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
            headerRight={<div className="flex items-center gap-2">
                {shell.isCompact ? null : (
                    <Button type="button" variant="cardPrimary" size="md" onClick={openCreate} aria-label="Add event" className={ADD_EVENT_CLASS}>
                        <CalendarPlus size={16} aria-hidden="true" />
                        <span className="hidden sm:inline">Add event</span>
                    </Button>
                )}
                {events.length > 0 ? <EventsMenu view={view} onViewChange={setSavedView} sort={sortMode} onSortChange={setSavedSort} /> : null}
            </div>}
            shellHeader={{
                title: "Events",
                eyebrow: "Calendar",
                icon: <CalendarHeart size={18} aria-hidden="true" />,
                accentColor: "var(--accent-nav-schedule, var(--accent-primary))",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="full" className="space-y-6">
                    <section className={shell.isCompact ? "" : "pt-6"}>
                        <div className="space-y-1">
                            {/* Compact headers already title the page. */}
                            <h1 className={shell.isCompact ? "sr-only" : "font-display text-2xl font-semibold tracking-tight text-twilight-text"}>
                                Your Personal Events
                            </h1>
                            <p className="text-sm text-twilight-text-soft">
                                Yearly recurring dates that stay visible in Schedule.
                            </p>
                        </div>
                    </section>

                    <EventsBody
                        events={events}
                        view={view}
                        sort={sortMode}
                        today={today}
                        stacked={shell.isCompact}
                        selectedEventId={selectedEventId}
                        onAdd={openCreate}
                        onOpen={toggleEdit}
                        onEdit={openEdit}
                        onDelete={deleteEvent}
                        onToggleReminder={toggleReminder}
                        onOpenInSchedule={(event) => handleOpenSchedule(getNextPersonalEventDate(event))}
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
        </MainLayout>
    );
}
