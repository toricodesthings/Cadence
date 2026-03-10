import { Switch } from "../../primitives";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/use-settings";

export function NotificationsTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const notifSettings = settings?.notifications || { email: true };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Notifications</h2>

            <SettingsSection title="Email Delivery">
                <SettingsRow
                    title="Daily Summary Emails"
                    description="Receive an email every morning outlining your tasks for the day and your past habit performance."
                >
                    <Switch
                        checked={notifSettings.email}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ notifications: { email: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Push Notifications (Browser)">
                <SettingsRow
                    title="Desktop Reminders"
                    description="Allow Cadence to send native notifications to your screen when task reminders or events trigger. (Requires browser permission)"
                >
                    <Switch
                        checked={false}
                        disabled
                        onCheckedChange={() => { }}
                    />
                </SettingsRow>
                <div className="mt-2 text-sm font-medium text-lantern/80">Push notifications are currently in development.</div>
            </SettingsSection>
        </div>
    );
}
