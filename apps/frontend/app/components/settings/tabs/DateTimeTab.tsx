import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/use-settings";

export function DateTimeTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const dtSettings = settings?.dateTime || {
        weekStart: 'Sunday',
        timezone: 'local',
        timeDisplay: '12h'
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Date & Time Formatting</h2>

            <SettingsSection title="Calendar & Week">
                <SettingsRow
                    title="First Day of Week"
                    description="Set the first day of the week in your calendar and weekly planners."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={dtSettings.weekStart}
                            onValueChange={(val) =>
                                updateSettings.mutate({ dateTime: { weekStart: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Sunday" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Sunday">Sunday</SelectItem>
                                <SelectItem value="Monday">Monday</SelectItem>
                                <SelectItem value="Saturday">Saturday</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Time Settings">
                <SettingsRow
                    title="Time Display"
                    description="Choose whether to see times in the 12-hour (1:00 PM) or 24-hour (13:00) format."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={dtSettings.timeDisplay}
                            onValueChange={(val) =>
                                updateSettings.mutate({ dateTime: { timeDisplay: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="12-hour (1:00 PM)" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="12h">12-hour (1:00 PM)</SelectItem>
                                <SelectItem value="24h">24-hour (13:00)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Timezone"
                    description="By default, Cadence automatically adapts to your system time. You can lock it to a specific timezone if you travel often."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={dtSettings.timezone}
                            onValueChange={(val) =>
                                updateSettings.mutate({ dateTime: { timezone: val } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Automatic (Local)" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="local">Automatic (Local)</SelectItem>
                                <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                                <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                                <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                                <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                                <SelectItem value="Europe/London">London (GMT)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
