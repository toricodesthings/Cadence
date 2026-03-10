import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { Switch } from "../../primitives";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/use-settings";

export function TasksTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const taskSettings = settings?.tasks || {
        defaultDueDate: null,
        hideTrash: false,
        hideCompleted: false
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Tasks & Workflow</h2>

            <SettingsSection title="Task Creation">
                <SettingsRow
                    title="Default Due Date"
                    description="When creating a new task, what should its due date default to?"
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={taskSettings.defaultDueDate || "None"}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { defaultDueDate: val === "None" ? null : val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select date" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="None">None</SelectItem>
                                <SelectItem value="Today">Today</SelectItem>
                                <SelectItem value="Tomorrow">Tomorrow</SelectItem>
                                <SelectItem value="Next Week">Next Week</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Sidebar Visibility">
                <SettingsRow
                    title="Hide Completed Tasks"
                    description="Remove the Completed tab from the main sidebar. You can always view completed tasks inside specific projects."
                >
                    <Switch
                        checked={taskSettings.hideCompleted}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { hideCompleted: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Hide Trash"
                    description="Remove the Trash tab from the main sidebar."
                >
                    <Switch
                        checked={taskSettings.hideTrash}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { hideTrash: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
