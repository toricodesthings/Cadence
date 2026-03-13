import { useState } from "react";
import { Switch } from "../../primitives";
import { Button } from "../../primitives/Button";
import { Input } from "../../primitives/Input";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/use-settings";
import { getBrowserPermission } from "../../../hooks/use-browser-notifications";

export function NotificationsTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const [permState, setPermState] = useState(getBrowserPermission);

    const notif = settings?.notifications ?? {
        email: true,
        browser: false,
        taskReminders: true,
        habitReminders: true,
        dueDateAlerts: true,
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
    };

    const handleRequestPermission = async () => {
        if (typeof window === "undefined" || !("Notification" in window)) return;
        const result = await Notification.requestPermission();
        setPermState(result as typeof permState);
        if (result === "granted") {
            updateSettings.mutate({ notifications: { browser: true } });
        }
    };

    const handleBrowserToggle = (val: boolean) => {
        if (val && permState !== "granted") {
            void handleRequestPermission();
        } else {
            updateSettings.mutate({ notifications: { browser: val } });
        }
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Notifications</h2>

            {/* ── Delivery ── */}
            <SettingsSection title="Delivery">
                <SettingsRow
                    title="Daily summary emails"
                    description="Receive a morning email outlining your tasks for the day and recent habit performance."
                >
                    <Switch
                        checked={notif.email}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { email: val } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Browser notifications"
                    description="Allows Cadence to send native desktop notifications when reminders trigger."
                >
                    <Switch
                        checked={notif.browser && permState === "granted"}
                        disabled={permState === "denied"}
                        onCheckedChange={handleBrowserToggle}
                    />
                </SettingsRow>

                {permState === "denied" && (
                    <p className="text-sm text-feedback-error -mt-2 px-1">
                        Browser notifications are blocked. Allow notifications for this site in your browser settings to enable them.
                    </p>
                )}

                {permState === "default" && !notif.browser && (
                    <div className="-mt-2 flex items-center gap-3 px-1">
                        <Button variant="secondary" size="sm" onClick={handleRequestPermission}>
                            Request permission
                        </Button>
                        <span className="text-xs text-twilight-text-muted">
                            Your browser will ask for permission
                        </span>
                    </div>
                )}

                {permState === "granted" && notif.browser && (
                    <p className="text-sm text-twilight-text-muted -mt-2 px-1">
                        Browser notifications are active. Reminders appear when the app is open.
                    </p>
                )}
            </SettingsSection>

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
                    title="Habit reminders"
                    description="Reminders for habits approaching their target time."
                >
                    <Switch
                        checked={notif.habitReminders}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { habitReminders: val } })
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
                                <Input
                                    type="time"
                                    value={notif.quietHoursStart ?? "22:00"}
                                    onChange={(e) =>
                                        updateSettings.mutate({ notifications: { quietHoursStart: e.target.value } })
                                    }
                                />
                            </div>
                        </SettingsRow>
                        <SettingsRow
                            title="End time"
                            description="Notifications resume at this time."
                        >
                            <div className="w-full sm:max-w-[10rem]">
                                <Input
                                    type="time"
                                    value={notif.quietHoursEnd ?? "07:00"}
                                    onChange={(e) =>
                                        updateSettings.mutate({ notifications: { quietHoursEnd: e.target.value } })
                                    }
                                />
                            </div>
                        </SettingsRow>
                    </>
                )}
            </SettingsSection>
        </div>
    );
}
