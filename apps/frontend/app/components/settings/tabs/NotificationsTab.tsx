import type React from "react";
import { Switch, TimePicker } from "../../primitives";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { SEGMENT_ACTIVE, SEGMENT_IDLE } from "../../primitives/SegmentedControl";
import { Button } from "../../primitives/Button";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { DeviceDeliveryRow, DeviceList } from "../../notifications/DeviceDelivery";
import { addDays, atLocal, todayIn } from "@cadence/domain/time";
import { cn } from "../../../lib/utils";
import { getUserZone } from "../../../lib/utils/user-zone";
import { formatShortDateTime } from "../../../lib/utils/date-format";
import { isWindowsDesktop } from "../../../lib/notifications/device-delivery";
import { setBackgroundDelivery, useDesktopCommandPreferences } from "../../../hooks/ui/use-desktop-command-preferences";

type Notif = UserSettings["notifications"];

/** One choice out of a few numbers, as chips: every option visible, one tap. */
function ChipRow<T extends number>({ value, options, onChange, label }: {
    value: T;
    options: ReadonlyArray<readonly [T, string]>;
    onChange: (value: T) => void;
    label: string;
}) {
    return (
        <SegmentedControl
            ariaLabel={label}
            className="max-w-full flex-wrap"
            value={String(value)}
            onChange={(next) => onChange(Number(next) as T)}
            options={options.map(([n, text]) => ({ value: String(n), label: text }))}
        />
    );
}

/** Several of a few numbers at once, as toggle chips. */
function MultiChips<T extends number>({ value, options, onChange, label }: {
    value: readonly T[];
    options: ReadonlyArray<readonly [T, string]>;
    onChange: (value: T[]) => void;
    label: string;
}) {
    return (
        <div role="group" aria-label={label} className="flex flex-wrap gap-2" style={{ "--segment-tone": "var(--accent-primary)" } as React.CSSProperties}>
            {options.map(([n, text]) => {
                const on = value.includes(n);
                return (
                    <button
                        key={n}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(options.map(([o]) => o).filter((o) => (o === n ? !on : value.includes(o))))}
                        className={cn("min-h-11 cursor-pointer rounded-xl border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50", on ? SEGMENT_ACTIVE : SEGMENT_IDLE)}
                    >
                        {text}
                    </button>
                );
            })}
        </div>
    );
}

const timeField = (label: string, value: string, onChange: (value: string) => void) => (
    <div className="w-full sm:max-w-[10rem]">
        <TimePicker label={label} value={value} onChange={onChange} />
    </div>
);

export function NotificationsTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const notif: Notif = { ...SETTINGS_DEFAULTS.notifications, ...settings?.notifications };
    const set = (patch: Partial<Notif>) => updateSettings.mutate({ notifications: patch });
    const { preferences: desktopPrefs } = useDesktopCommandPreferences();
    const paused = !!notif.pausedUntil && Date.parse(notif.pausedUntil) > Date.now();
    const pauseFor = (hours: number) => set({ pausedUntil: new Date(Date.now() + hours * 3_600_000).toISOString() });
    const pauseUntilMorning = () => {
        const zone = getUserZone();
        set({ pausedUntil: atLocal(addDays(todayIn(zone), 1), notif.morningTime, zone) });
    };
    const lead = (none = "At time") => [[0, none], [5, "5 min"], [10, "10 min"], [15, "15 min"], [30, "30 min"], [60, "1 hr"]] as const;

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Notifications</h2>

            <SettingsSection title="Delivery">
                <DeviceDeliveryRow />

                {isWindowsDesktop() && (
                    <SettingsRow
                        title="Keep running in the background"
                        description="Reminders keep arriving after you close the window. Quit from the tray icon. Applies next launch."
                    >
                        <Switch
                            checked={desktopPrefs.backgroundDelivery}
                            onCheckedChange={(val) => void setBackgroundDelivery(val)}
                        />
                    </SettingsRow>
                )}

                <SettingsRow
                    title="Daily summary"
                    description="Your day's tasks and routines, each morning."
                    className="opacity-60"
                >
                    <div className="flex items-center gap-3 sm:justify-end">
                        <span className="text-xs font-medium uppercase tracking-wider text-twilight-text-soft">Upcoming</span>
                        {/* ponytail: no sender exists yet, so the switch is inert; wire notif.email when the summary ships */}
                        <Switch checked={false} disabled aria-label="Daily summary (upcoming)" />
                    </div>
                </SettingsRow>
            </SettingsSection>

            <DeviceList />

            <SettingsSection title="Tasks">
                <SettingsRow title="Task reminders">
                    <Switch checked={notif.taskReminders} aria-label="Task reminders" onCheckedChange={(taskReminders) => set({ taskReminders })} />
                </SettingsRow>
                {notif.taskReminders && (
                    <SettingsRow title="Waiting follow-ups">
                        <Switch checked={notif.followUps} aria-label="Waiting follow-ups" onCheckedChange={(followUps) => set({ followUps })} />
                    </SettingsRow>
                )}
                <SettingsRow title="Due dates">
                    <Switch checked={notif.dueDateAlerts} aria-label="Due dates" onCheckedChange={(dueDateAlerts) => set({ dueDateAlerts })} />
                </SettingsRow>
                {notif.dueDateAlerts && (
                    <>
                        <SettingsRow title="Heads-up before">
                            <ChipRow label="Heads-up before a due date" value={notif.dueHeadsUpDays}
                                options={[[0, "None"], [1, "1 day"], [2, "2 days"], [7, "1 week"]] as const}
                                onChange={(dueHeadsUpDays) => set({ dueHeadsUpDays })} />
                        </SettingsRow>
                        <SettingsRow title="Keep overdue for">
                            <ChipRow label="How long overdue tasks stay listed" value={notif.overdueDays}
                                options={[[0, "Due day"], [1, "1 day"], [3, "3 days"], [7, "1 week"]] as const}
                                onChange={(overdueDays) => set({ overdueDays })} />
                        </SettingsRow>
                    </>
                )}
            </SettingsSection>

            <SettingsSection title="Schedule">
                <SettingsRow title="Timed blocks">
                    <Switch checked={notif.scheduleAlerts} aria-label="Timed blocks" onCheckedChange={(scheduleAlerts) => set({ scheduleAlerts })} />
                </SettingsRow>
                {notif.scheduleAlerts && (
                    <>
                        <SettingsRow title="Before a block">
                            <ChipRow label="Alert before a timed block" value={notif.blockLeadMinutes} options={lead("At start")}
                                onChange={(blockLeadMinutes) => set({ blockLeadMinutes })} />
                        </SettingsRow>
                        <SettingsRow title="Before Fixed blocks">
                            <ChipRow label="Alert before a Fixed block" value={notif.fixedLeadMinutes}
                                options={[[0, "At start"], [15, "15 min"], [30, "30 min"], [60, "1 hr"], [120, "2 hr"]] as const}
                                onChange={(fixedLeadMinutes) => set({ fixedLeadMinutes })} />
                        </SettingsRow>
                    </>
                )}
            </SettingsSection>

            <SettingsSection title="Routines">
                <SettingsRow title="Routine reminders">
                    <Switch checked={notif.habitReminders} aria-label="Routine reminders" onCheckedChange={(habitReminders) => set({ habitReminders })} />
                </SettingsRow>
                {notif.habitReminders && (
                    <>
                        <SettingsRow title="Before target time">
                            <ChipRow label="Alert before a routine's time" value={notif.habitReminderLeadMinutes} options={lead()}
                                onChange={(habitReminderLeadMinutes) => set({ habitReminderLeadMinutes })} />
                        </SettingsRow>
                        <SettingsRow title="Group several at once">
                            <Switch checked={notif.bundleMissedRoutinePrompts} aria-label="Group several routine reminders" onCheckedChange={(bundleMissedRoutinePrompts) => set({ bundleMissedRoutinePrompts })} />
                        </SettingsRow>
                    </>
                )}
            </SettingsSection>

            <SettingsSection title="Yearly events">
                <SettingsRow title="Notify" description="Each event's bell turns it on.">
                    <MultiChips label="When to notify for events" value={notif.eventDaysBefore}
                        options={[[0, "Same day"], [1, "1 day before"], [7, "1 week before"]] as const}
                        onChange={(eventDaysBefore) => set({ eventDaysBefore })} />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Quiet">
                <SettingsRow title="Pause">
                    {paused ? (
                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                            <span className="text-sm text-twilight-text-soft">Until {formatShortDateTime(notif.pausedUntil!)}</span>
                            <Button variant="secondary" onClick={() => set({ pausedUntil: null })}>Resume</Button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Button variant="secondary" onClick={() => pauseFor(1)}>1 hour</Button>
                            <Button variant="secondary" onClick={pauseUntilMorning}>Until tomorrow</Button>
                        </div>
                    )}
                </SettingsRow>
                <SettingsRow title="Quiet hours">
                    <Switch checked={notif.quietHoursEnabled} aria-label="Quiet hours" onCheckedChange={(quietHoursEnabled) => set({ quietHoursEnabled })} />
                </SettingsRow>
                {notif.quietHoursEnabled && (
                    <SettingsRow title="From – to">
                        <div className="flex w-full items-center gap-2 sm:justify-end">
                            {timeField("Quiet hours start", notif.quietHoursStart ?? "22:00", (quietHoursStart) => set({ quietHoursStart }))}
                            <span aria-hidden="true" className="text-twilight-text-soft">→</span>
                            {timeField("Quiet hours end", notif.quietHoursEnd ?? "07:00", (quietHoursEnd) => set({ quietHoursEnd }))}
                        </div>
                    </SettingsRow>
                )}
            </SettingsSection>

            <SettingsSection title="My day">
                <SettingsRow title="Morning" description="Due-date and event alerts, Defer to tomorrow.">
                    {timeField("Morning", notif.morningTime, (morningTime) => set({ morningTime }))}
                </SettingsRow>
                <SettingsRow title="Evening" description="Defer to this evening.">
                    {timeField("Evening", notif.eveningTime, (eveningTime) => set({ eveningTime }))}
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
