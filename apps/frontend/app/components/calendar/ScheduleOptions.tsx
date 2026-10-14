import { useId, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Feather, Wrench } from "lucide-react";
import { Switch } from "../primitives/Switch";
import { Tip } from "../primitives";
import * as Popover from "../primitives/Popover";
import { PhoneViewPicker } from "../layout/PageHeader";
import { useUpdateSettings } from "../../hooks/core/use-settings";
import type { ScheduleNavigation } from "../../hooks/calendar/use-schedule-navigation";
import type { ScheduleData } from "../../hooks/calendar/use-schedule-data";
import type { ScheduleTaskActions } from "../../hooks/calendar/use-schedule-task-actions";

const CLUTTER_ROWS = [
    { field: "showAllDay", label: "Show all-day tasks" },
    { field: "showTimedTasks", label: "Show timed blocks" },
    { field: "showFixed", label: "Show fixed blocks" },
    { field: "showHabitAnchors", label: "Show routine markers" },
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
    const extra = (label: string, to: string) => (
        <Tip label={label} side="top">
            <button type="button" aria-label={label}
                className={phone
                    ? "btn-icon glass-inset rounded-lg text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                    : "rounded-lg p-1 text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors cursor-pointer"}
                onClick={(event) => { event.preventDefault(); navigate(to); }}>
                <Wrench size={14} />
            </button>
        </Tip>
    );
    const overlayRows = [
        { section: "Holidays", label: "Show holidays", checked: holidayOverlay.enabled, onChange: holidayOverlay.setEnabled,
            extra: holidayOverlay.enabled ? extra("Configure holiday location", "?settings=location") : null },
        { section: "Events", label: "Show personal events", checked: personalEvents.enabled, onChange: personalEvents.setEnabled,
            extra: personalEvents.enabled ? extra("Manage events", "/events") : null },
    ];
    if (phone) return (
        <div className="space-y-4">
            <PhoneViewPicker value={viewMode} onChange={handleViewMode}
                options={[{ value: "day", label: "Day" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }]} />
            <div>
                <h4 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted">Show</h4>
                <ToggleRow phone label="Fixed" checked={calendarClutter.showFixed !== false} onChange={(showFixed) => updateClutter({ showFixed })} />
                <ToggleRow phone label="Routines" checked={calendarClutter.showHabitAnchors !== false} onChange={(showHabitAnchors) => updateClutter({ showHabitAnchors })} />
                <ToggleRow phone label="Tasks" checked={calendarClutter.showAllDay !== false && calendarClutter.showTimedTasks !== false}
                    onChange={(value) => updateClutter({ showAllDay: value, showTimedTasks: value })} />
                {overlayRows.map((row) => <ToggleRow key={row.section} phone label={row.section}
                    checked={row.checked} onChange={row.onChange} extra={row.extra} />)}
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
        <div className="space-y-4">
            <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-twilight-text-muted mb-2">Clutter</h4>
                <div className="space-y-2">
                    {CLUTTER_ROWS.map(({ field, label }) => <ToggleRow key={field} phone={false} label={label}
                        checked={field === "showFixed" ? calendarClutter[field] !== false : calendarClutter[field]}
                        onChange={(value) => updateClutter({ [field]: value })} />)}
                </div>
            </div>
            {overlayRows.map((row) => (
                <div key={row.section}>
                    <h4 className="text-xs font-medium uppercase tracking-wider text-twilight-text-muted mb-2">{row.section}</h4>
                    <div className="space-y-2">
                        <ToggleRow phone={false} label={row.label} checked={row.checked} onChange={row.onChange} extra={row.extra} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function ToggleRow({ phone, label, checked, onChange, extra }: {
    phone: boolean;
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    extra?: ReactNode;
}) {
    const switchId = useId();
    const control = <Switch id={switchId} aria-label={label} checked={checked} onCheckedChange={onChange} />;
    return (
        <label htmlFor={switchId} className={phone
            ? "flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-sm text-twilight-text"
            : "flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-sm text-twilight-text-soft"}>
            <span>{label}</span>
            {phone ? <span className="flex items-center gap-1">{extra}{control}</span>
                : extra ? <div className="flex items-center gap-2">{extra}{control}</div> : control}
        </label>
    );
}
