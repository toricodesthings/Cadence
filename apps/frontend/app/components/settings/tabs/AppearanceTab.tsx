import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";

export function AppearanceTab() {
    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                Appearance
                <span className="ml-2 rounded-full border border-twilight-border bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-twilight-text-soft">Future Upgrade</span>
            </h2>

            <div className="opacity-50 pointer-events-none">
                <SettingsSection title="Theme Engine">
                    <SettingsRow
                        title="Base Theme"
                        description="Cadence looks best in the dark, but daylight is available."
                    >
                        <div className="w-full sm:max-w-[18rem]">
                            <Select disabled value="twilight">
                                <SelectTrigger>
                                    <SelectValue placeholder="Twilight Sanctuary" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="twilight">Twilight Sanctuary</SelectItem>
                                    <SelectItem value="daylight">Daylight Room</SelectItem>
                                    <SelectItem value="system">Follow System</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SettingsRow>
                    <SettingsRow
                        title="Accent Luminance"
                        description="Choose how bright the core UI colors emit glow."
                    >
                        <div className="w-full sm:max-w-[18rem]">
                            <Select disabled value="medium">
                                <SelectTrigger>
                                    <SelectValue placeholder="Medium (Default)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium (Default)</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SettingsRow>
                </SettingsSection>
            </div>
        </div>
    );
}
