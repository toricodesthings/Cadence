import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Button } from "../../primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";

export function AITab() {
    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                Cadence Intelligence
                <span className="ml-2 rounded-full border border-lantern/30 bg-lantern/12 px-2 py-0.5 text-xs font-medium text-lantern">Coming Soon</span>
            </h2>

            <div className="opacity-50 pointer-events-none">
                <SettingsSection title="Model Configurations">
                    <SettingsRow
                        title="LLM Service Provider"
                        description="Choose the backing engine for Cadence Intelligence."
                    >
                        <div className="w-full sm:max-w-[18rem]">
                            <Select disabled value="openRouter">
                                <SelectTrigger>
                                    <SelectValue placeholder="OpenRouter" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="openRouter">OpenRouter</SelectItem>
                                    <SelectItem value="anthropic">Anthropic</SelectItem>
                                    <SelectItem value="openai">OpenAI</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SettingsRow>
                    <SettingsRow
                        title="Default Task Model"
                        description="Used for processing Inbox entries into tasks."
                    >
                        <div className="w-full sm:max-w-[18rem]">
                            <Select disabled value="haiku">
                                <SelectTrigger>
                                    <SelectValue placeholder="Claude 3.5 Haiku" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="haiku">Claude 3.5 Haiku</SelectItem>
                                    <SelectItem value="sonnet">Claude 3.5 Sonnet</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SettingsRow>
                </SettingsSection>
                <SettingsSection title="Context">
                    <SettingsRow
                        title="Memory Store"
                        description="Review the raw vector data Cadence knows about your work habits and life rhythms."
                    >
                        <Button disabled variant="secondary" className="bg-white/5 border-white/10">Manage Memories</Button>
                    </SettingsRow>
                </SettingsSection>
            </div>
        </div>
    );
}
