import { useEffect, useState, type CSSProperties } from "react";
import { Switch, TimePicker } from "../../primitives";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { SEGMENT_ACTIVE, SEGMENT_IDLE } from "../../primitives/SegmentedControl";
import { Button } from "../../primitives/Button";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { SwitchSetting } from "../layout/SettingRows";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { DeviceDeliveryRow, DeviceList } from "../../notifications/DeviceDelivery";
import { addDays, atLocal, todayIn } from "@cadence/domain/time";
import { cn } from "../../../lib/utils";
import { getUserZone } from "../../../lib/utils/user-zone";
import { formatShortDateTime } from "../../../lib/utils/date-format";
import { isWindowsDesktop } from "../../../lib/notifications/device-delivery";
import { setBackgroundDelivery, syncLoginLaunch, useDesktopCommandPreferences } from "../../../hooks/ui/use-desktop-command-preferences";

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
        <div role="group" aria-label={label} className="flex flex-wrap gap-2" style={{ "--segment-tone": "var(--accent-primary)" } as CSSProperties}>
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

type SectionProps = { notif: Notif; set: (patch: Partial<Notif>) => void };

const lead = (none = "At time") => [[0, none], [5, "5 min"], [10, "10 min"], [15, "15 min"], [30, "30 min"], [60, "1 hr"]] as const;

function TaskAlerts({ notif, set }: SectionProps) {
    return (
        <>
            <SettingsSection title="Tasks">
                <SwitchSetting title="Task reminders" checked={notif.taskReminders} onChange={(taskReminders) => set({ taskReminders })} />
                {notif.taskReminders && (
                    <SwitchSetting title="Waiting follow-ups" checked={notif.followUps} onChange={(followUps) => set({ followUps })} />
                )}
                <SwitchSetting title="Due dates" checked={notif.dueDateAlerts} onChange={(dueDateAlerts) => set({ dueDateAlerts })} />
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
        </>
    );
}

function ScheduleAlerts({ notif, set }: SectionProps) {
    return (
        <>
            <SettingsSection title="Schedule">
                <SwitchSetting title="Timed blocks" checked={notif.scheduleAlerts} onChange={(scheduleAlerts) => set({ scheduleAlerts })} />
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
        </>
    );
}

function RoutineAlerts({ notif, set }: SectionProps) {
    return (
        <>
            <SettingsSection title="Routines">
                <SwitchSetting title="Routine reminders" checked={notif.habitReminders} onChange={(habitReminders) => set({ habitReminders })} />
                {notif.habitReminders && (
                    <>
                        <SettingsRow title="Before target time">
                            <ChipRow label="Alert before a routine's time" value={notif.habitReminderLeadMinutes} options={lead()}
                                onChange={(habitReminderLeadMinutes) => set({ habitReminderLeadMinutes })} />
                        </SettingsRow>
                        <SwitchSetting title="Group several at once" label="Group several routine reminders" checked={notif.bundleMissedRoutinePrompts} onChange={(bundleMissedRoutinePrompts) => set({ bundleMissedRoutinePrompts })} />
                    </>
                )}
                <SwitchSetting title="Dot on Routines" description="Shows on Routines in the navigation while some are still due today." checked={notif.showHabitNavDueCount} onChange={(showHabitNavDueCount) => set({ showHabitNavDueCount })} />
            </SettingsSection>
        </>
    );
}

function QuietSections({ notif, set, paused, pauseFor, pauseUntilMorning }: SectionProps & { paused: boolean; pauseFor: (hours: number) => void; pauseUntilMorning: () => void }) {
    return (
        <>
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
                <SwitchSetting title="Quiet hours" description="Reminders wait in Cadence; any still ahead alert when it ends." checked={notif.quietHoursEnabled} onChange={(quietHoursEnabled) => set({ quietHoursEnabled })} />
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
        </>
    );
}

export function NotificationsTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const notif: Notif = { ...SETTINGS_DEFAULTS.notifications, ...settings?.notifications };
    const set = (patch: Partial<Notif>) => updateSettings.mutate({ notifications: patch });
    const { preferences: desktopPrefs } = useDesktopCommandPreferences();
    const [loginLaunchFailed, setLoginLaunchFailed] = useState(false);
    // Windows' startup list can drift from the saved setting (turned off in Task Manager, an old registration).
    useEffect(() => {
        if (isWindowsDesktop() && desktopPrefs.backgroundDelivery) void syncLoginLaunch(true).then((ok) => setLoginLaunchFailed(!ok));
    }, [desktopPrefs.backgroundDelivery]);
    const paused = !!notif.pausedUntil && Date.parse(notif.pausedUntil) > Date.now();
    const pauseFor = (hours: number) => set({ pausedUntil: new Date(Date.now() + hours * 3_600_000).toISOString() });
    const pauseUntilMorning = () => {
        const zone = getUserZone();
        set({ pausedUntil: atLocal(addDays(todayIn(zone), 1), notif.morningTime, zone) });
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Notifications</h2>

            <SettingsSection title="Delivery">
                <DeviceDeliveryRow />

                {isWindowsDesktop() && (
                    <SettingsRow
                        title="Keep running in the background"
                        description={loginLaunchFailed
                            ? "Windows didn't let Cadence start at sign-in, so reminders begin once you open it. The tray still works."
                            : "Reminders keep arriving after you close the window. Quit from the tray icon. Applies next launch."}
                    >
                        <Switch
                            checked={desktopPrefs.backgroundDelivery}
                            aria-label="Keep running in the background"
                            onCheckedChange={(val) => void setBackgroundDelivery(val).then((ok) => setLoginLaunchFailed(val && !ok))}
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

            <TaskAlerts notif={notif} set={set} />

            <ScheduleAlerts notif={notif} set={set} />

            <RoutineAlerts notif={notif} set={set} />

            <SettingsSection title="Yearly events">
                <SettingsRow title="Notify" description="Each event's bell turns it on.">
                    <MultiChips label="When to notify for events" value={notif.eventDaysBefore}
                        options={[[0, "Same day"], [1, "1 day before"], [7, "1 week before"]] as const}
                        onChange={(eventDaysBefore) => set({ eventDaysBefore })} />
                </SettingsRow>
            </SettingsSection>

            <QuietSections notif={notif} set={set} paused={paused} pauseFor={pauseFor} pauseUntilMorning={pauseUntilMorning} />
        </div>
    );
}
