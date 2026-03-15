import { Switch } from "../../primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../lib/types/settings";

function StatusBadge({ connected }: { connected: boolean }) {
    return (
        <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${
            connected
                ? "bg-green-500/10 text-green-400 border-green-500/20"
                : "bg-white/[0.04] text-twilight-text-muted border-white/10"
        }`}>
            {connected ? "Connected" : "Disconnected"}
        </span>
    );
}

export function IntegrationsTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const integrations = settings?.integrations ?? SETTINGS_DEFAULTS.integrations;

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                Integrations
                <span className="ml-2 rounded-full border border-lantern/30 bg-lantern/12 px-2 py-0.5 text-xs font-medium text-lantern">Coming Soon</span>
            </h2>

            <div className="opacity-50 pointer-events-none">

            {/* ── Calendar sync preferences ── */}
            <SettingsSection title="Calendar sync preferences">
                <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <h4 className="text-base font-medium text-twilight-text">Google Calendar</h4>
                        <StatusBadge connected={integrations.googleCalendar.enabled} />
                    </div>
                    <div className="flex flex-col gap-4">
                        <SettingsRow
                            title="Enable sync"
                            description="Sync Cadence tasks to a dedicated Google Calendar."
                        >
                            <Switch
                                checked={integrations.googleCalendar.enabled}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { googleCalendar: { enabled: val } } })
                                }
                            />
                        </SettingsRow>
                        <SettingsRow
                            title="Sync direction"
                            description="Choose one-way (Cadence → Google) or two-way sync."
                        >
                            <div className="w-full sm:max-w-[14rem]">
                                <Select
                                    value={integrations.googleCalendar.syncMode}
                                    onValueChange={(val) =>
                                        updateSettings.mutate({ integrations: { googleCalendar: { syncMode: val as any } } })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="one_way">One-way</SelectItem>
                                        <SelectItem value="two_way">Two-way</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </SettingsRow>
                        <SettingsRow
                            title="Include completed tasks"
                            description="Sync completed tasks alongside active ones."
                        >
                            <Switch
                                checked={integrations.googleCalendar.includeCompleted}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { googleCalendar: { includeCompleted: val } } })
                                }
                            />
                        </SettingsRow>
                    </div>
                </div>

                <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <h4 className="text-base font-medium text-twilight-text">Apple Calendar</h4>
                        <StatusBadge connected={integrations.appleCalendar.enabled} />
                    </div>
                    <div className="flex flex-col gap-4">
                        <SettingsRow
                            title="Enable sync"
                            description="Sync Cadence tasks to Apple Calendar via iCloud."
                        >
                            <Switch
                                checked={integrations.appleCalendar.enabled}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { appleCalendar: { enabled: val } } })
                                }
                            />
                        </SettingsRow>
                        <SettingsRow
                            title="Sync direction"
                            description="Choose one-way or two-way sync."
                        >
                            <div className="w-full sm:max-w-[14rem]">
                                <Select
                                    value={integrations.appleCalendar.syncMode}
                                    onValueChange={(val) =>
                                        updateSettings.mutate({ integrations: { appleCalendar: { syncMode: val as any } } })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="one_way">One-way</SelectItem>
                                        <SelectItem value="two_way">Two-way</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </SettingsRow>
                    </div>
                </div>
            </SettingsSection>

            {/* ── Notes & knowledge preferences ── */}
            <SettingsSection title="Notes & knowledge preferences">
                <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <h4 className="text-base font-medium text-twilight-text">Notion</h4>
                        <StatusBadge connected={integrations.notion.enabled} />
                    </div>
                    <div className="flex flex-col gap-4">
                        <SettingsRow
                            title="Enable Notion integration"
                            description="Allow Cadence to create and link items in Notion."
                        >
                            <Switch
                                checked={integrations.notion.enabled}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { notion: { enabled: val } } })
                                }
                            />
                        </SettingsRow>
                        <SettingsRow
                            title="Create backlinks"
                            description="Automatically add backlinks from Notion pages to Cadence tasks."
                        >
                            <Switch
                                checked={integrations.notion.createBacklinks}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { notion: { createBacklinks: val } } })
                                }
                            />
                        </SettingsRow>
                    </div>
                </div>

                <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <h4 className="text-base font-medium text-twilight-text">Obsidian</h4>
                        <StatusBadge connected={integrations.obsidian.enabled} />
                    </div>
                    <div className="flex flex-col gap-4">
                        <SettingsRow
                            title="Enable Obsidian integration"
                            description="Allow Cadence to interact with your Obsidian vault."
                        >
                            <Switch
                                checked={integrations.obsidian.enabled}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { obsidian: { enabled: val } } })
                                }
                            />
                        </SettingsRow>
                        <SettingsRow
                            title="Append task links"
                            description="Add links to Cadence tasks at the end of related Obsidian notes."
                        >
                            <Switch
                                checked={integrations.obsidian.appendTaskLinks}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { obsidian: { appendTaskLinks: val } } })
                                }
                            />
                        </SettingsRow>
                    </div>
                </div>
            </SettingsSection>

            {/* ── Calendar feed preferences ── */}
            <SettingsSection title="Calendar feed preferences">
                <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <h4 className="text-base font-medium text-twilight-text">ICS Calendar Feed</h4>
                        <StatusBadge connected={integrations.ics.enabled} />
                    </div>
                    <div className="flex flex-col gap-4">
                        <SettingsRow
                            title="Enable ICS feed"
                            description="Generate a read-only ICS feed URL for subscribing in any calendar app."
                        >
                            <Switch
                                checked={integrations.ics.enabled}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { ics: { enabled: val } } })
                                }
                            />
                        </SettingsRow>
                        <SettingsRow
                            title="Include habits"
                            description="Add habit schedules to the ICS feed alongside tasks."
                        >
                            <Switch
                                checked={integrations.ics.includeHabits}
                                onCheckedChange={(val) =>
                                    updateSettings.mutate({ integrations: { ics: { includeHabits: val } } })
                                }
                            />
                        </SettingsRow>
                    </div>
                </div>
            </SettingsSection>
            </div>
        </div>
    );
}
