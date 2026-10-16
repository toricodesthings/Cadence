import { useState } from "react";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { SelectSetting, SwitchSetting, type SettingOption } from "../layout/SettingRows";
import { Button } from "../../primitives";
import { toast } from "sonner";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { useApiClient } from "../../../hooks/auth/use-api-client";
import { unwrapResponse } from "../../../lib/api/helpers";
import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { ShieldCheck, Trash2 } from "lucide-react";
import { toastError } from "../../../lib/utils/error-toast";

const CONFIDENCE_OPTIONS: SettingOption[] = [
    { value: "high", label: "High — only certain matches" },
    { value: "medium", label: "Medium — balanced" },
    { value: "low", label: "Low — show everything detected" },
];
const PRESENTATION_OPTIONS: SettingOption[] = [
    { value: "compact", label: "Compact trigger" },
    { value: "expanded", label: "Expanded tray by default" },
];

type Updater = ReturnType<typeof useUpdateSettings>;
type Privacy = UserSettings["privacy"];
type Intelligence = NonNullable<UserSettings["tasks"]["intelligence"]>;

function PrivacySection({ privacy, updateSettings }: { privacy: Privacy; updateSettings: Updater }) {
    const diagnosticsEnabled = privacy.usageDiagnostics;
    return (
        <SettingsSection title="Privacy">
            <SwitchSetting
                title="Usage diagnostics"
                description="Allow Cadence to collect anonymous interaction patterns (routes visited, actions used, latencies). No task titles or personal text is ever stored."
                checked={diagnosticsEnabled}
                onChange={(val) => updateSettings.mutate({ privacy: { usageDiagnostics: val } })}
            />
            <SwitchSetting
                title="Crash reports"
                description="Send anonymous crash reports to help improve stability."
                checked={privacy.crashReports ?? SETTINGS_DEFAULTS.privacy.crashReports}
                onChange={(val) => updateSettings.mutate({ privacy: { crashReports: val } })}
            />
            <div className="rounded-lg border border-white/8 bg-white/3 p-4 text-sm text-twilight-text-soft">
                <div className={`flex items-center gap-2 mb-2${diagnosticsEnabled ? " text-accent-primary" : ""}`}>
                    <ShieldCheck size={16} />
                    <span className="font-medium">{diagnosticsEnabled ? "What Cadence collects" : "No data collected"}</span>
                </div>
                <p>
                    {diagnosticsEnabled
                        ? "Routes visited, action types, capture-to-placement latency, parse confidence tiers, and interaction methods. Task titles, note content, and personal text are never collected."
                        : "Usage diagnostics are off. Turn them on to help Cadence improve friction detection."}
                </p>
            </div>
        </SettingsSection>
    );
}

function ParsingSection({ intelligence, setIntel }: { intelligence: Intelligence; setIntel: (patch: Partial<Intelligence>) => void }) {
    return (
        <SettingsSection title="Natural Language Parsing">
            <SwitchSetting
                title="Enable NLP parsing"
                description="Parse dates, priorities, tags, and list names from your capture and task input."
                checked={intelligence.nlpEnabled}
                onChange={(val) => setIntel({ nlpEnabled: val })}
            />
            <SwitchSetting
                title="Suggest where captures go"
                description="Sends a new capture's text, or a search that found nothing, with your list, section and task names, to an AI provider to suggest a destination or a match. Off sends nothing."
                checked={intelligence.smartPlacement !== false}
                onChange={(val) => setIntel({ smartPlacement: val })}
            />
            <SwitchSetting
                title="Explanation verbosity"
                description="Show parse explanation chips when Cadence detects dates, priorities, or context."
                checked={intelligence.showExplanations}
                onChange={(val) => setIntel({ showExplanations: val })}
            />
            <SelectSetting
                title="Confidence threshold"
                description="Only apply parsed values that meet this confidence level. Lower means more automation, higher means more manual control."
                value={intelligence.confidenceThreshold}
                options={CONFIDENCE_OPTIONS}
                widthClass="sm:max-w-[14rem]"
                onChange={(val) => setIntel({ confidenceThreshold: val as "high" | "medium" | "low" })}
            />
            <SwitchSetting
                title="Low-stimulation mode"
                description="Reduce parse chips, explanation density, and visual noise from intelligence features."
                checked={intelligence.lowStimulationMode}
                onChange={(val) => setIntel({ lowStimulationMode: val })}
            />
        </SettingsSection>
    );
}

function RankingSection({ intelligence, setIntel }: { intelligence: Intelligence; setIntel: (patch: Partial<Intelligence>) => void }) {
    return (
        <SettingsSection title="Ranking & Focus Views">
            <SwitchSetting
                title="Smart sort"
                description="Automatically rank tasks by urgency, due dates, effort, and pinned status. Fully deterministic — no AI involved."
                checked={intelligence.smartSortEnabled}
                onChange={(val) => setIntel({ smartSortEnabled: val })}
            />
            <SwitchSetting
                title="Focus Views"
                description="Enable Focus Views — deterministic filters like 'Quick Wins', 'Due Soon', 'Needs Dates' that help narrow your task list."
                checked={intelligence.focusViewsEnabled}
                onChange={(val) => setIntel({ focusViewsEnabled: val })}
            />
            <SelectSetting
                title="Focus View presentation"
                description="How Focus Views appear on task pages."
                value={intelligence.focusViewPresentation ?? "compact"}
                options={PRESENTATION_OPTIONS}
                widthClass="sm:max-w-[14rem]"
                onChange={(val) => setIntel({ focusViewPresentation: val as "compact" | "expanded" })}
            />
        </SettingsSection>
    );
}

export function AITab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const client = useApiClient();
    const [isClearingHistory, setIsClearingHistory] = useState(false);

    const privacy = settings?.privacy ?? SETTINGS_DEFAULTS.privacy;
    const intelligence = settings?.tasks?.intelligence ?? SETTINGS_DEFAULTS.tasks.intelligence;

    const handleClearHistory = async () => {
        setIsClearingHistory(true);

        try {
            const res = await client.api.settings["intelligence-history"].clear.$post({});
            await unwrapResponse(res);
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
            toastError(error, "Couldn't clear intelligence history");
        } finally {
            setIsClearingHistory(false);
        }
    };

    const setIntel = (patch: Partial<Intelligence>) => updateSettings.mutate({ tasks: { intelligence: patch } });

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                Intelligence &amp; Privacy
            </h2>
            <p className="text-sm text-twilight-text-soft -mt-8">
                Control how Cadence understands your input, ranks your tasks, and respects your data.
                Parsing, ranking and Focus Views run on your device. One switch below sends a capture's words, or a search that
                found nothing, to an AI provider to suggest where it goes or what you meant.
            </p>

            <PrivacySection privacy={privacy} updateSettings={updateSettings} />
            <ParsingSection intelligence={intelligence} setIntel={setIntel} />
            <RankingSection intelligence={intelligence} setIntel={setIntel} />

            <SettingsSection title="Data">
                <SettingsRow
                    title="Clear intelligence history"
                    description="Remove all stored parse snapshots and dismissed entity records. This does not affect your tasks or routines."
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
