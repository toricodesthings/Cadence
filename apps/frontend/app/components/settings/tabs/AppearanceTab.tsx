import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { useSettings, useUpdateSettings } from "../../../hooks/use-settings";

export function AppearanceTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const appearance = settings?.appearance ?? {
        theme: "twilight" as const,
        accentIntensity: "balanced" as const,
        motion: "system" as const,
        density: "comfortable" as const,
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Appearance</h2>

            <SettingsSection title="Theme">
                <SettingsRow
                    title="Color theme"
                    description="Cadence looks best in twilight, but a lighter option is available for daytime use."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={appearance.theme}
                            onValueChange={(val) =>
                                updateSettings.mutate({ appearance: { theme: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="twilight">Twilight Sanctuary</SelectItem>
                                <SelectItem value="daylight">Daylight Room</SelectItem>
                                <SelectItem value="system">Follow system</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
                <SettingsRow
                    title="Accent intensity"
                    description="Controls how brightly accent colors glow across the interface."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={appearance.accentIntensity}
                            onValueChange={(val) =>
                                updateSettings.mutate({ appearance: { accentIntensity: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="soft">Soft</SelectItem>
                                <SelectItem value="balanced">Balanced</SelectItem>
                                <SelectItem value="vivid">Vivid</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Motion">
                <SettingsRow
                    title="Animation preference"
                    description="Choose whether Cadence plays animations, defers to your system setting, or disables motion entirely."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={appearance.motion}
                            onValueChange={(val) =>
                                updateSettings.mutate({ appearance: { motion: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="system">Follow system</SelectItem>
                                <SelectItem value="full">Always animate</SelectItem>
                                <SelectItem value="reduced">Reduce motion</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Density">
                <SettingsRow
                    title="Interface density"
                    description="Compact mode tightens spacing for smaller screens or a denser workflow."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={appearance.density}
                            onValueChange={(val) =>
                                updateSettings.mutate({ appearance: { density: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="comfortable">Comfortable</SelectItem>
                                <SelectItem value="compact">Compact</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
