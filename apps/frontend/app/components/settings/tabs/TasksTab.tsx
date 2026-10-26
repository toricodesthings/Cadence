import type { UserSettings } from "../../../types/settings";
type TaskSettings = UserSettings["tasks"];
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { SelectSetting, SwitchSetting, type SettingOption } from "../layout/SettingRows";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";

type Updater = ReturnType<typeof useUpdateSettings>;
type Intelligence = NonNullable<TaskSettings["intelligence"]>;
const DUE_OPTIONS: SettingOption[] = [
    { value: "None", label: "None" },
    { value: "Today", label: "Today" },
    { value: "Tomorrow", label: "Tomorrow" },
    { value: "Next Week", label: "Next Week" },
];
const PLACEMENT_OPTIONS: SettingOption[] = [
    { value: "top", label: "Top of list" },
    { value: "bottom", label: "Bottom of list" },
];
const VIEW_OPTIONS: SettingOption[] = [
    { value: "list", label: "Rows" },
    { value: "kanban", label: "Kanban" },
];
const STYLE_OPTIONS: SettingOption[] = [
    { value: "label", label: "Icon + label" },
    { value: "icon", label: "Icon only" },
];
const QUICK_ADD_CHOICES = [
    { value: "date", label: "Date" },
    { value: "priority", label: "Priority" },
    { value: "project", label: "List" },
    { value: "tag", label: "Tag" },
] as const;
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
            <SwitchSetting
                title="Start new tasks at Low priority"
                description="Off leaves new tasks with no priority, so only what you mark stands out."
                checked={taskSettings.defaultPriority === "low"}
                onChange={(val) => set({ defaultPriority: val ? "low" : "none" })}
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
                <SwitchSetting
                    title="Completion celebration"
                    description="Show a brief visual flourish when you complete a task."
                    checked={taskSettings.showDoneCelebration}
                    onChange={(val) => set({ showDoneCelebration: val })}
                />
            </SettingsSection>

            <SettingsSection title="Routines">
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

function IntelligenceSection({ intelligence, updateSettings }: { intelligence: Intelligence; updateSettings: Updater }) {
    const setIntel = (patch: Partial<Intelligence>) => updateSettings.mutate({ tasks: { intelligence: patch } });
    return (
        <SettingsSection title="Intelligence">
            <SwitchSetting
                title="Smart features"
                description="Read dates, lists, tags and priorities from what you type. Runs on your device."
                checked={intelligence.nlpEnabled}
                onChange={(val) => setIntel({ nlpEnabled: val })}
            />
            {intelligence.nlpEnabled && (
                <>
                    <SwitchSetting
                        title="Suggest Effort"
                        description="Cadence guesses an Effort from the ones you've chosen on similar tasks and uses it for day load. Guesses are marked ~; you always pick what's saved."
                        checked={intelligence.effortSuggestions}
                        onChange={(val) => setIntel({ effortSuggestions: val })}
                    />
                </>
            )}
            <SwitchSetting
                title="Suggest with an AI provider"
                description="Sends a new capture's text, a search that found nothing, or a new task's title with your own earlier Effort choices, to an AI provider to suggest a destination, a match, an Effort, or the priority its words state. Off sends nothing."
                checked={intelligence.smartPlacement !== false}
                onChange={(val) => setIntel({ smartPlacement: val })}
            />
            <SwitchSetting
                title="Focus Views"
                description="Preset and custom filters like Quick Wins, Due Soon and Deep Focus."
                checked={intelligence.focusViewsEnabled}
                onChange={(val) => setIntel({ focusViewsEnabled: val })}
            />
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
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Tasks & Routines</h2>
            <TaskDefaultsSection taskSettings={taskSettings} updateSettings={updateSettings} />
            <ViewsAndWorkflowSections taskSettings={taskSettings} updateSettings={updateSettings} />
            <QuickAddSection taskSettings={taskSettings} updateSettings={updateSettings} />
            <IntelligenceSection intelligence={intelligence} updateSettings={updateSettings} />
        </div>
    );
}
