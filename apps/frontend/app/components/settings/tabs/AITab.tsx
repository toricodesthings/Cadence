import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Button } from "../../primitives";
import { Switch } from "../../primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { useSettings, useUpdateSettings } from "../../../hooks/use-settings";
import { SETTINGS_DEFAULTS } from "../../../lib/types/settings";
import { Lightbulb, ShieldCheck } from "lucide-react";

export function AITab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const privacy = settings?.privacy ?? SETTINGS_DEFAULTS.privacy;
    const diagnosticsEnabled = privacy.usageDiagnostics;

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                Cadence Intelligence
                <span className="ml-2 rounded-full border border-lantern/30 bg-lantern/12 px-2 py-0.5 text-xs font-medium text-lantern">Coming Soon</span>
            </h2>

            {/* ── Privacy Gating ── */}
            <SettingsSection title="Usage Insights">
                <SettingsRow
                    title="Enable usage diagnostics"
                    description="Allow Cadence to collect anonymized usage patterns for future AI suggestions. This powers all intelligence features."
                >
                    <Switch
                        checked={diagnosticsEnabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { usageDiagnostics: val } })
                        }
                    />
                </SettingsRow>

                {diagnosticsEnabled ? (
                    <div className="rounded-lg border border-white/8 bg-white/3 p-4 text-sm text-twilight-textSecondary">
                        <div className="flex items-center gap-2 mb-2 text-lantern">
                            <Lightbulb size={16} />
                            <span className="font-medium">Data collection active</span>
                        </div>
                        <p>
                            Cadence is quietly learning your patterns — completions, reschedules, schedule density,
                            and habit adherence. This data stays private and will power optional suggestions like
                            "lighten today" or "move overdue tasks" once intelligence features are ready.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-lg border border-white/8 bg-white/3 p-4 text-sm text-twilight-textSecondary">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck size={16} />
                            <span className="font-medium">No data collected</span>
                        </div>
                        <p>
                            Usage diagnostics are off. AI-powered suggestions will not be available until
                            this is enabled. You can turn it on at any time — Cadence never overrides your
                            control.
                        </p>
                    </div>
                )}
            </SettingsSection>

            {/* ── Coming Soon Features ── */}
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

                <SettingsSection title="Suggestions">
                    <SettingsRow
                        title="Suggested actions"
                        description="Cadence can suggest decluttering, rescheduling, or lightening your day. You always decide."
                    >
                        <Switch disabled checked={false} />
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
