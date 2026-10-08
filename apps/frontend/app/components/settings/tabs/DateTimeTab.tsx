import { useMemo, type ReactNode } from "react";
import { formatInZone } from "@cadence/domain/time";
import { Link, useNavigate } from "react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { SearchSelect } from "../../primitives/SearchSelect";
import { Switch } from "../../primitives";
import { SegmentedControl, type SegmentedOption } from "../../primitives/SegmentedControl";
import { Button } from "../../primitives/Button";
import { SettingsSection, SettingsRow, SettingsList } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS, type DeepPartial, type UserSettings } from "../../../types/settings";
import { HOLIDAY_SOURCE_LABELS, useHolidayOverlay } from "../../../hooks/environment/use-holiday-overlay";
import { usePersonalEvents } from "../../../hooks/calendar/use-personal-events";
import { useMinuteClock } from "../../../hooks/ui/use-realtime-clock";
import { deviceZone, resolveZone, useToday } from "../../../lib/utils/user-zone";
import { formatWallTime } from "../../../lib/utils/date-format";

/** Every IANA zone the runtime knows, "UTC" first (some runtimes leave it out of the list). */
function listZones(): string[] {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return ["UTC", ...all.filter((zone) => zone !== "UTC")];
}

/** "UTC-04:00" etc. for a zone at the given instant. */
function zoneOffsetLabel(zone: string, atISO: string): string {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
        .formatToParts(new Date(atISO))
        .find((part) => part.type === "timeZoneName")?.value ?? "";
    return offset.replace("GMT", "UTC") || "UTC+0";
}

/** "device" follows the device; an IANA name pins the zone. The row's description is a live clock in the chosen zone. */
function TimezoneRow({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const device = deviceZone();
    const now = useMinuteClock().toISOString(); // time-ok: the current instant, shown in the chosen zone
    const options = useMemo(() => listZones().map((zone) => ({ value: zone, label: `${zone.replace(/_/g, " ")} (${zoneOffsetLabel(zone, now)})` })), [now]);
    const pinned = useMemo(() => [{ value: "device", label: `Device (${device}, ${zoneOffsetLabel(device, now)})` }], [device, now]);
    const preview = formatInZone(now, resolveZone(value), { weekday: "short", hour: "numeric", minute: "2-digit" });

    return (
        <SettingsRow title="Time zone" description={`Now: ${preview}`}>
            <div className="w-full sm:max-w-[18rem]">
                <SearchSelect value={value} onValueChange={onChange} options={options} pinned={pinned} ariaLabel="Time zone" searchLabel="Search time zones" />
            </div>
        </SettingsRow>
    );
}

type DateTime = UserSettings["dateTime"];
type Calendar = UserSettings["calendar"];

const TIME_DISPLAY: ReadonlyArray<SegmentedOption<DateTime["timeDisplay"]>> = [
    { value: "12h", label: "12-hour" },
    { value: "24h", label: "24-hour" },
];
const DATE_STYLE: ReadonlyArray<SegmentedOption<NonNullable<DateTime["dateStyle"]>>> = [
    { value: "mdy", label: "MM/DD/YYYY" },
    { value: "dmy", label: "DD/MM/YYYY" },
    { value: "ymd", label: "YYYY-MM-DD" },
];
const WEEK_START: ReadonlyArray<SegmentedOption<DateTime["weekStart"]>> = [
    { value: "Sunday", label: "Sun" },
    { value: "Monday", label: "Mon" },
    { value: "Saturday", label: "Sat" },
];
const VIEW: ReadonlyArray<SegmentedOption<NonNullable<Calendar["defaultView"]>>> = [
    { value: "month", label: "Month" },
    { value: "week", label: "Week" },
    { value: "day", label: "Day" },
];
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour));

const segment = <T extends string,>(label: string, value: T, options: ReadonlyArray<SegmentedOption<T>>, onChange: (value: T) => void) => (
    <SegmentedControl ariaLabel={label} className="max-w-full" value={value} options={options} onChange={onChange} />
);

export function DateTimeTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const navigate = useNavigate();
    const currentYear = Number(useToday().slice(0, 4));
    const holidayOverlay = useHolidayOverlay({
        start: `${currentYear}-01-01`,
        end: `${currentYear}-12-31`,
        viewMode: "year",
        fetchOverlay: false,
    });
    const personalEvents = usePersonalEvents(currentYear);

    const dt: DateTime = { ...SETTINGS_DEFAULTS.dateTime, ...settings?.dateTime };
    const cal = { ...SETTINGS_DEFAULTS.calendar, ...settings?.calendar };
    const clutter = { ...SETTINGS_DEFAULTS.calendar.clutter, ...cal.clutter };
    const setDate = (patch: DeepPartial<DateTime>) => updateSettings.mutate({ dateTime: patch });
    const setCalendar = (patch: DeepPartial<Calendar>) => updateSettings.mutate({ calendar: patch });
    const setClutter = (patch: DeepPartial<Calendar["clutter"]>) => setCalendar({ clutter: patch });

    /** One line: title, an optional note, and a switch (with an extra button beside it). */
    const toggle = (title: string, checked: boolean, onChange: (value: boolean) => void, note?: string, extra?: ReactNode) => (
        <SettingsRow inline title={title} description={note}>
            <div className="flex items-center gap-3">
                {extra}
                <Switch checked={checked} aria-label={title} onCheckedChange={onChange} />
            </div>
        </SettingsRow>
    );

    const regionNote = `${holidayOverlay.regionLabel ?? "Region unknown"}${holidayOverlay.source ? ` · ${HOLIDAY_SOURCE_LABELS[holidayOverlay.source]}` : ""}`;
    const eventCount = personalEvents.items.length;

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Calendar & Time</h2>

            <SettingsSection title="Region & format">
                <SettingsList>
                    <TimezoneRow value={dt.timezone} onChange={(timezone) => setDate({ timezone })} />
                    <SettingsRow title="Time">{segment("Time format", dt.timeDisplay, TIME_DISPLAY, (timeDisplay) => setDate({ timeDisplay }))}</SettingsRow>
                    <SettingsRow title="Date">{segment("Date format", dt.dateStyle ?? "mdy", DATE_STYLE, (dateStyle) => setDate({ dateStyle }))}</SettingsRow>
                    <SettingsRow title="Week starts">{segment("First day of the week", dt.weekStart, WEEK_START, (weekStart) => setDate({ weekStart }))}</SettingsRow>
                </SettingsList>
            </SettingsSection>

            <SettingsSection title="Calendar">
                <SettingsList>
                    <SettingsRow title="Opens in">{segment("Default calendar view", cal.defaultView ?? "month", VIEW, (defaultView) => setCalendar({ defaultView }))}</SettingsRow>
                    <SettingsRow title="Day and week open at">
                        <div className="w-full sm:max-w-[10rem]">
                            <Select value={String(cal.timelineStartHour ?? 7)} onValueChange={(hour) => setCalendar({ timelineStartHour: Number(hour) })}>
                                <SelectTrigger aria-label="Hour the day and week views open at"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {HOURS.map((hour) => <SelectItem key={hour} value={hour}>{formatWallTime(`${hour.padStart(2, "0")}:00`)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </SettingsRow>
                    {toggle("Week numbers", cal.showWeekNumbers ?? false, (showWeekNumbers) => setCalendar({ showWeekNumbers }))}
                    {toggle("Weekends", cal.showWeekends ?? true, (showWeekends) => setCalendar({ showWeekends }))}
                </SettingsList>
            </SettingsSection>

            <SettingsSection title="Show on calendar">
                <SettingsList>
                    {toggle("All-day tasks", clutter.showAllDay ?? true, (showAllDay) => setClutter({ showAllDay }))}
                    {toggle("Timed blocks", clutter.showTimedTasks ?? true, (showTimedTasks) => setClutter({ showTimedTasks }))}
                    {toggle("Fixed blocks", clutter.showFixed ?? true, (showFixed) => setClutter({ showFixed }))}
                    {toggle("Routines", clutter.showHabitAnchors ?? true, (showHabitAnchors) => setClutter({ showHabitAnchors }))}
                    {toggle("Holidays", holidayOverlay.enabled, holidayOverlay.setEnabled, regionNote,
                        <Button variant="ghost" size="sm" aria-label="Change holiday region" onClick={() => navigate("?settings=location")}>Change</Button>)}
                    {toggle("Yearly events", personalEvents.enabled, personalEvents.setEnabled,
                        eventCount > 0 ? `${eventCount} in your library` : "None yet",
                        <Button asChild variant="ghost" size="sm"><Link to="/events">Manage</Link></Button>)}
                </SettingsList>
            </SettingsSection>
        </div>
    );
}
