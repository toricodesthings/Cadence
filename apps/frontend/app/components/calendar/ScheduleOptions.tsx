import { useId, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { CalendarHeart, Clock, Feather, Flag, Flame, CheckSquare, Lock, Settings, type LucideIcon } from "lucide-react";
import { MENU_LABEL, MENU_SEPARATOR, MENU_SWITCH, MENU_TOGGLE_ROW } from "../primitives/menu-styles";
import { Switch } from "../primitives/Switch";
import { Tip } from "../primitives";
import * as Popover from "../primitives/Popover";
import { PhoneViewPicker } from "../layout/PageHeader";
import { useUpdateSettings } from "../../hooks/core/use-settings";
import type { ScheduleNavigation } from "../../hooks/calendar/use-schedule-navigation";
import type { ScheduleData } from "../../hooks/calendar/use-schedule-data";
import type { ScheduleTaskActions } from "../../hooks/calendar/use-schedule-task-actions";

const CLUTTER_ROWS = [
    { field: "showAllDay", label: "All-day tasks", icon: CheckSquare },
    { field: "showTimedTasks", label: "Timed blocks", icon: Clock },
    { field: "showFixed", label: "Fixed blocks", icon: Lock },
    { field: "showHabitAnchors", label: "Routine markers", icon: Flame },
] as const;

export function ScheduleOptions({ phone, navigation, data, actions }: {
    phone: boolean;
    navigation: ScheduleNavigation;
    data: Pick<ScheduleData, "calendarClutter" | "holidayOverlay" | "personalEvents" | "lightenCandidates">;
    actions: Pick<ScheduleTaskActions, "setLightenOpen">;
}) {
    const navigate = useNavigate();
    const updateSettings = useUpdateSettings();
    const { calendarClutter, holidayOverlay, personalEvents, lightenCandidates } = data;
    const { viewMode, handleViewMode, isPhoneDay, currentDate, todayIso } = navigation;
    const updateClutter = (clutter: Partial<typeof calendarClutter>) => updateSettings.mutate({ calendar: { clutter } });
    const extra = (label: string, to: string, Icon: LucideIcon) => (
        <Tip label={label} side="top">
            <button type="button" aria-label={label}
                className="press inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text"
                onClick={(event) => { event.preventDefault(); navigate(to); }}>
                <Icon size={14} aria-hidden="true" />
            </button>
        </Tip>
    );
    const overlayRows = [
        { section: "Holidays", label: "Holidays", icon: Flag, checked: holidayOverlay.enabled, onChange: holidayOverlay.setEnabled,
            extra: holidayOverlay.enabled ? extra("Holiday location", "?settings=location", Settings) : null },
        { section: "Events", label: "Personal events", icon: CalendarHeart, checked: personalEvents.enabled, onChange: personalEvents.setEnabled,
            extra: personalEvents.enabled ? extra("Events", "/events", CalendarHeart) : null },
    ];
    const overlays = overlayRows.map((row) => <ToggleRow key={row.section} icon={row.icon} label={phone ? row.section : row.label}
        checked={row.checked} onChange={row.onChange} extra={row.extra} />);
    if (phone) return (
        <div className="space-y-3">
            <h4 className={`-mx-2 -mb-2 ${MENU_LABEL}`}>View</h4>
            <PhoneViewPicker value={viewMode} onChange={handleViewMode}
                options={[{ value: "day", label: "Day" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }]} />
            <div className="-mx-2">
                <h4 className={MENU_LABEL}>Show</h4>
                <ToggleRow icon={Lock} label="Fixed" checked={calendarClutter.showFixed !== false} onChange={(showFixed) => updateClutter({ showFixed })} />
                <ToggleRow icon={Flame} label="Routines" checked={calendarClutter.showHabitAnchors !== false} onChange={(showHabitAnchors) => updateClutter({ showHabitAnchors })} />
                <ToggleRow icon={CheckSquare} label="Tasks" checked={calendarClutter.showAllDay !== false && calendarClutter.showTimedTasks !== false}
                    onChange={(value) => updateClutter({ showAllDay: value, showTimedTasks: value })} />
                {overlays}
            </div>
            {isPhoneDay && currentDate === todayIso && lightenCandidates.length > 0 ? (
                <Popover.Close asChild>
                    <button type="button" onClick={() => actions.setLightenOpen(true)}
                        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-twilight-border/40 px-3 text-left text-sm text-twilight-text transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                        <Feather size={15} className="text-accent-primary" aria-hidden="true" />
                        <span className="flex-1">Lighten today…</span>
                    </button>
                </Popover.Close>
            ) : null}
        </div>
    );
    return (
        <>
            <h4 className={MENU_LABEL}>Show</h4>
            {CLUTTER_ROWS.map(({ field, label, icon }) => <ToggleRow key={field} icon={icon} label={label}
                checked={field === "showFixed" ? calendarClutter[field] !== false : calendarClutter[field]}
                onChange={(value) => updateClutter({ [field]: value })} />)}
            <div role="separator" className={MENU_SEPARATOR} />
            <h4 className={MENU_LABEL}>Dates</h4>
            {overlays}
        </>
    );
}

/** A menu row (`MENU_TOGGLE_ROW`): icon, label, an optional shortcut, and the switch the whole row toggles. */
function ToggleRow({ icon: Icon, label, checked, onChange, extra }: {
    icon: LucideIcon;
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    extra?: ReactNode;
}) {
    const switchId = useId();
    return (
        <label htmlFor={switchId} className={`${MENU_TOGGLE_ROW} min-h-11 py-1!`}>
            <Icon size={14} aria-hidden="true" className="shrink-0" />
            <span className="flex-1">{label}</span>
            {extra}
            <Switch id={switchId} aria-label={label} checked={checked} onCheckedChange={onChange} className={MENU_SWITCH} />
        </label>
    );
}
