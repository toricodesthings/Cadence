import { Switch, TimePicker } from "../../primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";
import { DeviceDeliveryRow, DeviceList } from "../../notifications/DeviceDelivery";
import { isWindowsDesktop } from "../../../lib/notifications/device-delivery";
import { useDesktopBackgroundDelivery } from "../../../hooks/ui/use-desktop-background-delivery";

export function NotificationsTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const notif = settings?.notifications ?? SETTINGS_DEFAULTS.notifications;
    const backgroundDelivery = useDesktopBackgroundDelivery();

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Notifications</h2>

            {/* ── Delivery ── */}
            <SettingsSection title="Delivery">
                <SettingsRow
                    title="Daily summary emails"
                    description="Receive a morning email outlining your tasks for the day and your routines."
                >
                    <Switch
                        checked={notif.email}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { email: val } })
                        }
                    />
                </SettingsRow>

                <DeviceDeliveryRow />

                {isWindowsDesktop() && (
                    <SettingsRow
                        title="Keep running in the background"
                        description="Reminders keep arriving after you close this window, and Cadence reopens at login. Takes effect the next time you open Cadence. A tray icon is the way back in — Quit Cadence from there to stop it."
                    >
                        <Switch
                            checked={backgroundDelivery.enabled}
                            onCheckedChange={(val) => void backgroundDelivery.setEnabled(val)}
                        />
                    </SettingsRow>
                )}
            </SettingsSection>

            <DeviceList />

            {/* ── Reminder Types ── */}
            <SettingsSection title="Reminder types">
                <SettingsRow
                    title="Task reminders"
                    description="Show notifications for tasks with an explicit reminder time."
                >
                    <Switch
                        checked={notif.taskReminders}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { taskReminders: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Due date alerts"
                    description="Notify when tasks are due today or overdue."
                >
                    <Switch
                        checked={notif.dueDateAlerts}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { dueDateAlerts: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Routine reminders"
                    description="Reminders for routines approaching their target time."
                >
                    <Switch
                        checked={notif.habitReminders}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { habitReminders: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Default reminder lead time"
                    description="How far in advance routine reminders fire before the target time."
                >
                    <div className="w-full sm:max-w-[10rem]">
                        <Select
                            value={String(notif.habitReminderLeadMinutes)}
                            onValueChange={(val) =>
                                updateSettings.mutate({ notifications: { habitReminderLeadMinutes: Number(val) as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">5 minutes</SelectItem>
                                <SelectItem value="10">10 minutes</SelectItem>
                                <SelectItem value="15">15 minutes</SelectItem>
                                <SelectItem value="30">30 minutes</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            {/* ── Routine behavior ── */}
            <SettingsSection title="Routine behavior">
                <SettingsRow
                    title="Show a dot on Routines"
                    description="Show a dot on the Routines link when a routine is open today."
                >
                    <Switch
                        checked={notif.showHabitNavDueCount}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { showHabitNavDueCount: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Bundle routine reminders"
                    description="When several routine reminders are due at once, show one notification instead of one each."
                >
                    <Switch
                        checked={notif.bundleMissedRoutinePrompts}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { bundleMissedRoutinePrompts: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Quiet Hours ── */}
            <SettingsSection title="Quiet hours">
                <SettingsRow
                    title="Enable quiet hours"
                    description="Suppress all notifications during a scheduled window each day."
                >
                    <Switch
                        checked={notif.quietHoursEnabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { quietHoursEnabled: val } })
                        }
                    />
                </SettingsRow>

                {notif.quietHoursEnabled && (
                    <>
                        <SettingsRow
                            title="Start time"
                            description="Notifications pause at this time each day."
                        >
                            <div className="w-full sm:max-w-[10rem]">
                                <TimePicker
                                    label="Quiet hours start"
                                    value={notif.quietHoursStart ?? "22:00"}
                                    onChange={(value) => updateSettings.mutate({ notifications: { quietHoursStart: value } })}
                                />
                            </div>
                        </SettingsRow>
                        <SettingsRow
                            title="End time"
                            description="Notifications resume at this time."
                        >
                            <div className="w-full sm:max-w-[10rem]">
                                <TimePicker
                                    label="Quiet hours end"
                                    value={notif.quietHoursEnd ?? "07:00"}
                                    onChange={(value) => updateSettings.mutate({ notifications: { quietHoursEnd: value } })}
                                />
                            </div>
                        </SettingsRow>
                    </>
                )}
            </SettingsSection>
        </div>
    );
}
