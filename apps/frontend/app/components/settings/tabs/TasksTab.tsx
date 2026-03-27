import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { Switch } from "../../primitives";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { ChevronDown } from "lucide-react";

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
        quickAdd: {
            preset: "planner" as const,
            style: "label" as const,
            actions: ["date", "priority", "project"] as Array<"date" | "priority" | "project" | "tag">,
        },
    };

    const quickAddActions = taskSettings.quickAdd?.actions ?? ["date", "priority", "project"];

    const intelligence = taskSettings.intelligence ?? {
        nlpEnabled: true,
        autoParseOnCapture: true,
        confidenceThreshold: "medium" as const,
        showExplanations: true,
        lowStimulationMode: false,
        smartSortEnabled: true,
        focusViewsEnabled: true,
        dismissedEntities: [],
    };

    const [showAdvanced, setShowAdvanced] = useState(false);

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

            <SettingsSection title="Quick add">
                <SettingsRow
                    title="Preset"
                    description="Choose how much quick-add control shows up by default."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={taskSettings.quickAdd?.preset ?? "planner"}
                            onValueChange={(val) =>
                                updateSettings.mutate({
                                    tasks: {
                                        quickAdd: {
                                            preset: val as "minimal" | "planner" | "power",
                                            actions:
                                                val === "minimal"
                                                    ? ["date"]
                                                    : val === "power"
                                                        ? ["date", "priority", "project", "tag"]
                                                        : ["date", "priority", "project"],
                                        },
                                    },
                                })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="minimal">Minimal</SelectItem>
                                <SelectItem value="planner">Planner</SelectItem>
                                <SelectItem value="power">Power User</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Tray style"
                    description="Use icon-only buttons for a denser composer or labels for more clarity."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={taskSettings.quickAdd?.style ?? "label"}
                            onValueChange={(val) =>
                                updateSettings.mutate({ tasks: { quickAdd: { style: val as "icon" | "label" } } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="label">Icon + label</SelectItem>
                                <SelectItem value="icon">Icon only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Visible actions"
                    description="These controls stay consistent across inline add and global quick add."
                    className="items-start"
                >
                    <div className="flex flex-wrap gap-2 sm:max-w-[28rem]">
                        {[
                            { value: "date", label: "Date" },
                            { value: "priority", label: "Priority" },
                            { value: "project", label: "Project" },
                            { value: "tag", label: "Tag" },
                        ].map((action) => {
                            const active = quickAddActions.includes(action.value as any);

                            return (
                                <button
                                    key={action.value}
                                    type="button"
                                    onClick={() => {
                                        const next = active
                                            ? quickAddActions.filter((item) => item !== action.value)
                                            : [...quickAddActions, action.value as any];
                                        updateSettings.mutate({ tasks: { quickAdd: { actions: next as any } } });
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

            <SettingsSection title="Intelligence">
                <SettingsRow
                    title="Smart features"
                    description="Enable Cadence's built-in intelligence for parsing dates, projects, tags, and more from natural language."
                >
                    <Switch
                        checked={intelligence.nlpEnabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ tasks: { intelligence: { nlpEnabled: val } } })
                        }
                    />
                </SettingsRow>

                {intelligence.nlpEnabled && (
                    <>
                        <SettingsRow
                            title="Smart Capture"
                            description="Automatically recognize dates, priorities, projects, and tags as you type."
                        >
                            <Switch
                                checked={intelligence.autoParseOnCapture}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ tasks: { intelligence: { autoParseOnCapture: val } } })
                                }
                            />
                        </SettingsRow>

                        <SettingsRow
                            title="Focus Views"
                            description="Enable preset and custom Focus Views like Quick Wins, Due Soon, and Deep Focus."
                        >
                            <Switch
                                checked={intelligence.focusViewsEnabled}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ tasks: { intelligence: { focusViewsEnabled: val } } })
                                }
                            />
                        </SettingsRow>

                        <SettingsRow
                            title="Confidence threshold"
                            description="Only apply suggestions that meet this confidence level automatically."
                        >
                            <div className="w-full sm:max-w-[18rem]">
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
                                        <SelectItem value="high">High — only very confident</SelectItem>
                                        <SelectItem value="medium">Medium — balanced</SelectItem>
                                        <SelectItem value="low">Low — show everything</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </SettingsRow>

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
                                    <SettingsRow
                                        title="Smart ordering"
                                        description="Use intelligent ranking instead of simple date/priority sort."
                                    >
                                        <Switch
                                            checked={intelligence.smartSortEnabled}
                                            onCheckedChange={(val) =>
                                                updateSettings.mutate({ tasks: { intelligence: { smartSortEnabled: val } } })
                                            }
                                        />
                                    </SettingsRow>
                                    <SettingsRow
                                        title="Show recognition chips"
                                        description="Display visual indicators for recognized entities below the input field."
                                    >
                                        <Switch
                                            checked={intelligence.showExplanations}
                                            onCheckedChange={(val) =>
                                                updateSettings.mutate({ tasks: { intelligence: { showExplanations: val } } })
                                            }
                                        />
                                    </SettingsRow>
                                    <SettingsRow
                                        title="Low-stimulation mode"
                                        description="Reduce chip density and collapse secondary recognition details."
                                    >
                                        <Switch
                                            checked={intelligence.lowStimulationMode}
                                            onCheckedChange={(val) =>
                                                updateSettings.mutate({ tasks: { intelligence: { lowStimulationMode: val } } })
                                            }
                                        />
                                    </SettingsRow>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </SettingsSection>
        </div>
    );
}
