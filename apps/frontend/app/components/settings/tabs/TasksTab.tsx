import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { Switch } from "../../primitives";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";

export function TasksTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const taskSettings = settings?.tasks ?? {
        defaultDueDate: null,
        defaultView: "list" as const,
        defaultPriority: "none" as const,
        defaultDurationMinutes: null,
        newTaskPlacement: "bottom" as const,
        openDetailOnCreate: false,
        hideTrash: false,
        hideCompleted: false,
        showDoneCelebration: true,
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Tasks & Workflow</h2>

            <SettingsSection title="Task defaults">
                <SettingsRow
                    title="Default due date"
                    description="When you create a new task, Cadence will pre-fill this due date."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={taskSettings.defaultDueDate || "None"}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { defaultDueDate: val === "None" ? null : val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
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

                <SettingsRow
                    title="Default priority"
                    description="New tasks start at this priority level unless you change it."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={taskSettings.defaultPriority}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { defaultPriority: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Default duration"
                    description="Pre-fill the estimated duration for new tasks."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={taskSettings.defaultDurationMinutes?.toString() ?? "none"}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { defaultDurationMinutes: val === "none" ? null : Number(val) as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="15">15 minutes</SelectItem>
                                <SelectItem value="30">30 minutes</SelectItem>
                                <SelectItem value="45">45 minutes</SelectItem>
                                <SelectItem value="60">1 hour</SelectItem>
                                <SelectItem value="90">1.5 hours</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="New task placement"
                    description="Where new tasks appear in a list — at the top or the bottom."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={taskSettings.newTaskPlacement}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { newTaskPlacement: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="top">Top of list</SelectItem>
                                <SelectItem value="bottom">Bottom of list</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Views & visibility">
                <SettingsRow
                    title="Default task view"
                    description="Open task lists in this layout by default."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={taskSettings.defaultView}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { defaultView: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="list">List</SelectItem>
                                <SelectItem value="kanban">Kanban</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Hide completed tasks"
                    description="Remove the Completed tab from the main sidebar."
                >
                    <Switch
                        checked={taskSettings.hideCompleted}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { hideCompleted: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Hide trash"
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

            <SettingsSection title="Workflow behavior">
                <SettingsRow
                    title="Open detail panel on create"
                    description="Automatically open the task detail panel when you create a new task."
                >
                    <Switch
                        checked={taskSettings.openDetailOnCreate}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { openDetailOnCreate: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Completion celebration"
                    description="Show a brief visual flourish when you complete a task."
                >
                    <Switch
                        checked={taskSettings.showDoneCelebration}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { showDoneCelebration: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
