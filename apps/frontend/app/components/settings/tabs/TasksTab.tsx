import { useState } from "react";
import type { UserSettings } from "../../../types/settings";
type TaskSettings = UserSettings["tasks"];
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { SelectSetting, SwitchSetting, type SettingOption } from "../layout/SettingRows";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { ChevronDown } from "lucide-react";
import { SETTINGS_DEFAULTS } from "../../../types/settings";

type Updater = ReturnType<typeof useUpdateSettings>;
type Intelligence = NonNullable<TaskSettings["intelligence"]>;
const PRIORITY_OPTIONS: SettingOption[] = [
    { value: "none", label: "None" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
];
const DUE_OPTIONS: SettingOption[] = [
    { value: "None", label: "None" },
    { value: "Today", label: "Today" },
    { value: "Tomorrow", label: "Tomorrow" },
    { value: "Next Week", label: "Next Week" },
];
const DURATION_OPTIONS: SettingOption[] = [
    { value: "none", label: "None" },
    { value: "15", label: "15 minutes" },
    { value: "30", label: "30 minutes" },
    { value: "45", label: "45 minutes" },
    { value: "60", label: "1 hour" },
    { value: "90", label: "1.5 hours" },
];
const PLACEMENT_OPTIONS: SettingOption[] = [
    { value: "top", label: "Top of list" },
    { value: "bottom", label: "Bottom of list" },
];
const VIEW_OPTIONS: SettingOption[] = [
    { value: "list", label: "Rows" },
    { value: "kanban", label: "Kanban" },
];
const PRESET_OPTIONS: SettingOption[] = [
    { value: "minimal", label: "Minimal" },
    { value: "planner", label: "Planner" },
    { value: "power", label: "Power User" },
];
const STYLE_OPTIONS: SettingOption[] = [
    { value: "label", label: "Icon + label" },
    { value: "icon", label: "Icon only" },
];
const CONFIDENCE_OPTIONS: SettingOption[] = [
    { value: "high", label: "High — only very confident" },
    { value: "medium", label: "Medium — balanced" },
    { value: "low", label: "Low — show everything" },
];
const QUICK_ADD_CHOICES = [
    { value: "date", label: "Date" },
    { value: "priority", label: "Priority" },
    { value: "project", label: "List" },
    { value: "tag", label: "Tag" },
] as const;
const PRESET_ACTIONS = {
    minimal: ["date"],
    planner: ["date", "priority", "project"],
    power: ["date", "priority", "project", "tag"],
} as const;

function TaskDefaultsSection({ taskSettings, updateSettings }: { taskSettings: TaskSettings; updateSettings: Updater }) {
    const set = (tasks: Partial<TaskSettings>) => updateSettings.mutate({ tasks });
    return (
        <SettingsSection title="Task defaults">
            <SelectSetting
                title="Default due date"
                description="When you create a new task, Cadence will pre-fill this due date."
                value={taskSettings.defaultDueDate || "None"}
                options={DUE_OPTIONS}
                onChange={(val) => set({ defaultDueDate: val === "None" ? null : val as TaskSettings["defaultDueDate"] })}
            />
            <SelectSetting
                title="Default priority"
                description="New tasks start at this priority level unless you change it."
                value={taskSettings.defaultPriority}
                options={PRIORITY_OPTIONS}
                onChange={(val) => set({ defaultPriority: val as TaskSettings["defaultPriority"] })}
            />
            <SelectSetting
                title="Default duration"
                description="Pre-fill the estimated duration for new tasks."
                value={taskSettings.defaultDurationMinutes?.toString() ?? "none"}
                options={DURATION_OPTIONS}
                onChange={(val) => set({ defaultDurationMinutes: val === "none" ? null : Number(val) as TaskSettings["defaultDurationMinutes"] })}
            />
            <SelectSetting
                title="New task placement"
                description="Where new tasks appear in a list — at the top or the bottom."
                value={taskSettings.newTaskPlacement}
                options={PLACEMENT_OPTIONS}
                onChange={(val) => set({ newTaskPlacement: val as TaskSettings["newTaskPlacement"] })}
            />
        </SettingsSection>
    );
}

function ViewsAndWorkflowSections({ taskSettings, updateSettings }: { taskSettings: TaskSettings; updateSettings: Updater }) {
    const set = (tasks: Partial<TaskSettings>) => updateSettings.mutate({ tasks });
    return (
        <>
            <SettingsSection title="Views & visibility">
                <SelectSetting
                    title="Default task view"
                    description="Open task lists in this layout by default."
                    value={taskSettings.defaultView}
                    options={VIEW_OPTIONS}
                    onChange={(val) => set({ defaultView: val as TaskSettings["defaultView"] })}
                />
                <SwitchSetting
                    title="Hide completed tasks"
                    description="Remove the Completed tab from the main sidebar."
                    checked={taskSettings.hideCompleted}
                    onChange={(val) => set({ hideCompleted: val })}
                />
                <SwitchSetting
                    title="Hide trash"
                    description="Remove the Trash tab from the main sidebar."
                    checked={taskSettings.hideTrash}
                    onChange={(val) => set({ hideTrash: val })}
                />
            </SettingsSection>

            <SettingsSection title="Workflow behavior">
                <SwitchSetting
                    title="Open detail panel on create"
                    description="Automatically open the task detail panel when you create a new task."
                    checked={taskSettings.openDetailOnCreate}
                    onChange={(val) => set({ openDetailOnCreate: val })}
                />
                <SwitchSetting
                    title="Completion celebration"
                    description="Show a brief visual flourish when you complete a task."
                    checked={taskSettings.showDoneCelebration}
                    onChange={(val) => set({ showDoneCelebration: val })}
                />
                <SwitchSetting
                    title="Routine streaks"
                    description="Show how many times in a row you've kept each routine."
                    checked={taskSettings.showStreaks}
                    onChange={(val) => set({ showStreaks: val })}
                />
            </SettingsSection>
        </>
    );
}

function QuickAddSection({ taskSettings, updateSettings }: { taskSettings: TaskSettings; updateSettings: Updater }) {
    const quickAddActions = taskSettings.quickAdd?.actions ?? ["date", "priority", "project"];
    return (
        <SettingsSection title="Quick add">
            <SelectSetting
                title="Preset"
                description="Choose how much quick-add control shows up by default."
                value={taskSettings.quickAdd?.preset ?? "planner"}
                options={PRESET_OPTIONS}
                onChange={(val) => {
                    const preset = val as keyof typeof PRESET_ACTIONS;
                    updateSettings.mutate({ tasks: { quickAdd: { preset, actions: [...PRESET_ACTIONS[preset]] } } });
                }}
            />
            <SelectSetting
                title="Tray style"
                description="Use icon-only buttons for a denser composer or labels for more clarity."
                value={taskSettings.quickAdd?.style ?? "label"}
                options={STYLE_OPTIONS}
                onChange={(val) => updateSettings.mutate({ tasks: { quickAdd: { style: val as "icon" | "label" } } })}
            />
            <SettingsRow
                title="Visible actions"
                description="These controls stay consistent across inline add and global quick add."
                className="items-start"
            >
                <div className="flex flex-wrap gap-2 sm:max-w-[28rem]">
                    {QUICK_ADD_CHOICES.map((action) => {
                        const active = quickAddActions.includes(action.value);
                        return (
                            <button
                                key={action.value}
                                type="button"
                                onClick={() => {
                                    const next = active
                                        ? quickAddActions.filter((item) => item !== action.value)
                                        : [...quickAddActions, action.value];
                                    updateSettings.mutate({ tasks: { quickAdd: { actions: next } } });
                                }}
                                className={`min-h-10 rounded-xl border px-3 text-sm transition-colors ${
                                    active
                                        ? "border-accent-primary/25 bg-accent-primary/12 text-accent-primary"
                                        : "border-twilight-border/40 bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05]"
                                }`}
                            >
                                {action.label}
                            </button>
                        );
                    })}
                </div>
            </SettingsRow>
        </SettingsSection>
    );
}

function AdvancedIntelligence({ intelligence, setIntel }: { intelligence: Intelligence; setIntel: (patch: Partial<Intelligence>) => void }) {
    const [showAdvanced, setShowAdvanced] = useState(false);
    return (
        <div>
            <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-sm text-twilight-text-muted hover:text-twilight-text transition-colors px-1 py-1.5 cursor-pointer"
            >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-0" : "-rotate-90"}`} />
                Advanced
            </button>
            {showAdvanced && (
                <div className="mt-2 flex flex-col gap-0.5">
                    <SwitchSetting
                        title="Smart ordering"
                        description="Use intelligent ranking instead of simple date/priority sort."
                        checked={intelligence.smartSortEnabled}
                        onChange={(val) => setIntel({ smartSortEnabled: val })}
                    />
                    <SwitchSetting
                        title="Show recognition chips"
                        description="Display visual indicators for recognized entities below the input field."
                        checked={intelligence.showExplanations}
                        onChange={(val) => setIntel({ showExplanations: val })}
                    />
                    <SwitchSetting
                        title="Low-stimulation mode"
                        description="Reduce chip density and collapse secondary recognition details."
                        checked={intelligence.lowStimulationMode}
                        onChange={(val) => setIntel({ lowStimulationMode: val })}
                    />
                </div>
            )}
        </div>
    );
}

function IntelligenceSection({ intelligence, updateSettings }: { intelligence: Intelligence; updateSettings: Updater }) {
    const setIntel = (patch: Partial<Intelligence>) => updateSettings.mutate({ tasks: { intelligence: patch } });
    return (
        <SettingsSection title="Intelligence">
            <SwitchSetting
                title="Smart features"
                description="Enable Cadence's built-in intelligence for parsing dates, lists, tags, and more from natural language."
                checked={intelligence.nlpEnabled}
                onChange={(val) => setIntel({ nlpEnabled: val })}
            />
            {intelligence.nlpEnabled && (
                <>
                    <SwitchSetting
                        title="Smart Capture"
                        description="Automatically recognize dates, priorities, lists, and tags as you type."
                        checked={intelligence.autoParseOnCapture}
                        onChange={(val) => setIntel({ autoParseOnCapture: val })}
                    />
                    <SwitchSetting
                        title="Suggest Effort"
                        description="Offer an Effort level from the choices you've made on similar tasks. You always pick; nothing is filled in for you."
                        checked={intelligence.effortSuggestions}
                        onChange={(val) => setIntel({ effortSuggestions: val })}
                    />
                    <SwitchSetting
                        title="Focus Views"
                        description="Enable preset and custom Focus Views like Quick Wins, Due Soon, and Deep Focus."
                        checked={intelligence.focusViewsEnabled}
                        onChange={(val) => setIntel({ focusViewsEnabled: val })}
                    />
                    <SelectSetting
                        title="Confidence threshold"
                        description="Only apply suggestions that meet this confidence level automatically."
                        value={intelligence.confidenceThreshold}
                        options={CONFIDENCE_OPTIONS}
                        onChange={(val) => setIntel({ confidenceThreshold: val as "high" | "medium" | "low" })}
                    />
                    <AdvancedIntelligence intelligence={intelligence} setIntel={setIntel} />
                </>
            )}
        </SettingsSection>
    );
}

export function TasksTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const taskSettings = settings?.tasks ?? SETTINGS_DEFAULTS.tasks;
    const intelligence = taskSettings.intelligence ?? SETTINGS_DEFAULTS.tasks.intelligence;

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Tasks & Workflow</h2>
            <TaskDefaultsSection taskSettings={taskSettings} updateSettings={updateSettings} />
            <ViewsAndWorkflowSections taskSettings={taskSettings} updateSettings={updateSettings} />
            <QuickAddSection taskSettings={taskSettings} updateSettings={updateSettings} />
            <IntelligenceSection intelligence={intelligence} updateSettings={updateSettings} />
        </div>
    );
}
