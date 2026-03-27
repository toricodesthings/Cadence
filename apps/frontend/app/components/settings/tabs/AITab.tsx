import { useState } from "react";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Button } from "../../primitives";
import { Switch } from "../../primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { toast } from "sonner";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { useApiClient } from "../../../hooks/auth/use-api-client";
import { unwrapResponse } from "../../../lib/api/helpers";
import { SETTINGS_DEFAULTS } from "../../../types/settings";
import { ShieldCheck, Trash2 } from "lucide-react";

export function AITab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const client = useApiClient();
    const [isClearingHistory, setIsClearingHistory] = useState(false);

    const privacy = settings?.privacy ?? SETTINGS_DEFAULTS.privacy;
    const diagnosticsEnabled = privacy.usageDiagnostics;
    const intelligence = settings?.tasks?.intelligence ?? SETTINGS_DEFAULTS.tasks.intelligence;

    const handleClearHistory = async () => {
        setIsClearingHistory(true);

        try {
            const res = await client.api.settings["intelligence-history"]["clear"].$post({});
            await unwrapResponse<{ cleared: boolean }>(res);
            updateSettings.mutate({
                tasks: {
                    intelligence: {
                        dismissedEntityIds: [],
                        dismissedEntities: [],
                    },
                },
            });
            try {
                window.localStorage.removeItem("cadence_notification_state");
            } catch {
                // Ignore local storage failures and keep the successful server-side clear.
            }
            toast.success("Cleared stored intelligence history.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not clear intelligence history.");
        } finally {
            setIsClearingHistory(false);
        }
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                Intelligence &amp; Privacy
            </h2>
            <p className="text-sm text-twilight-text-soft -mt-8">
                Control how Cadence understands your input, ranks your tasks, and respects your data.
                Everything here is deterministic and runs locally — no AI models, no cloud processing.
            </p>

            {/* ── Privacy & Diagnostics ── */}
            <SettingsSection title="Privacy">
                <SettingsRow
                    title="Usage diagnostics"
                    description="Allow Cadence to collect anonymous interaction patterns (routes visited, actions used, latencies). No task titles or personal text is ever stored."
                >
                    <Switch
                        checked={diagnosticsEnabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { usageDiagnostics: val } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Crash reports"
                    description="Send anonymous crash reports to help improve stability."
                >
                    <Switch
                        checked={privacy.crashReports ?? SETTINGS_DEFAULTS.privacy.crashReports}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { crashReports: val } })
                        }
                    />
                </SettingsRow>

                {diagnosticsEnabled ? (
                    <div className="rounded-lg border border-white/8 bg-white/3 p-4 text-sm text-twilight-text-soft">
                        <div className="flex items-center gap-2 mb-2 text-accent-primary">
                            <ShieldCheck size={16} />
                            <span className="font-medium">What Cadence collects</span>
                        </div>
                        <p>
                            Routes visited, action types, capture-to-placement latency, parse confidence tiers, and interaction methods.
                            Task titles, note content, and personal text are never collected.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-lg border border-white/8 bg-white/3 p-4 text-sm text-twilight-text-soft">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck size={16} />
                            <span className="font-medium">No data collected</span>
                        </div>
                        <p>
                            Usage diagnostics are off. Turn them on to help Cadence improve friction detection.
                        </p>
                    </div>
                )}
            </SettingsSection>

            {/* ── NLP & Parsing ── */}
            <SettingsSection title="Natural Language Parsing">
                <SettingsRow
                    title="Enable NLP parsing"
                    description="Parse dates, priorities, tags, and project names from your capture and task input."
                >
                    <Switch
                        checked={intelligence.nlpEnabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { intelligence: { nlpEnabled: val } } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Explanation verbosity"
                    description="Show parse explanation chips when Cadence detects dates, priorities, or context."
                >
                    <Switch
                        checked={intelligence.showExplanations}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { intelligence: { showExplanations: val } } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Confidence threshold"
                    description="Only apply parsed values that meet this confidence level. Lower means more automation, higher means more manual control."
                >
                    <div className="w-full sm:max-w-[14rem]">
                        <Select
                            value={intelligence.confidenceThreshold}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { intelligence: { confidenceThreshold: val as "high" | "medium" | "low" } } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="high">High — only certain matches</SelectItem>
                                <SelectItem value="medium">Medium — balanced</SelectItem>
                                <SelectItem value="low">Low — show everything detected</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Low-stimulation mode"
                    description="Reduce parse chips, explanation density, and visual noise from intelligence features."
                >
                    <Switch
                        checked={intelligence.lowStimulationMode}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { intelligence: { lowStimulationMode: val } } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Smart Sort & Focus Views ── */}
            <SettingsSection title="Ranking & Focus Views">
                <SettingsRow
                    title="Smart sort"
                    description="Automatically rank tasks by urgency, due dates, effort, and pinned status. Fully deterministic — no AI involved."
                >
                    <Switch
                        checked={intelligence.smartSortEnabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { intelligence: { smartSortEnabled: val } } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Focus Views"
                    description="Enable Focus Views — deterministic filters like 'Quick Wins', 'Due Soon', 'Needs Dates' that help narrow your task list."
                >
                    <Switch
                        checked={intelligence.focusViewsEnabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { intelligence: { focusViewsEnabled: val } } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Focus View presentation"
                    description="How Focus Views appear on task pages."
                >
                    <div className="w-full sm:max-w-[14rem]">
                        <Select
                            value={intelligence.focusViewPresentation ?? "compact"}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { intelligence: { focusViewPresentation: val as "compact" | "expanded" } } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="compact">Compact trigger</SelectItem>
                                <SelectItem value="expanded">Expanded tray by default</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            {/* ── Data Management ── */}
            <SettingsSection title="Data">
                <SettingsRow
                    title="Clear intelligence history"
                    description="Remove all stored parse snapshots and dismissed entity records. This does not affect your tasks or habits."
                >
                    <Button
                        variant="secondary"
                        disabled={isClearingHistory}
                        onClick={() => void handleClearHistory()}
                        className="bg-white/5 border-white/10 text-twilight-text-soft hover:text-red-400 hover:border-red-400/20"
                    >
                        <Trash2 size={14} className="mr-1.5" />
                        {isClearingHistory ? "Clearing..." : "Clear history"}
                    </Button>
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
