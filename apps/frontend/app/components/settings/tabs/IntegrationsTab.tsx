import type { ReactNode } from "react";
import type { UserSettings } from "../../../types/settings";
import { SettingsSection } from "../layout/SettingsLayout";
import { SelectSetting, SwitchSetting, type SettingOption } from "../layout/SettingRows";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";
import { ConnectedAssistants } from "../ConnectedAssistants";

type Integrations = UserSettings["integrations"];
type SyncMode = Integrations["googleCalendar"]["syncMode"];

const SYNC_OPTIONS: SettingOption[] = [
    { value: "one_way", label: "One-way" },
    { value: "two_way", label: "Two-way" },
];

function SoonBadge() {
    return (
        <span className="rounded-full border border-accent-primary/30 bg-accent-primary/12 px-2 py-0.5 text-[10px] font-medium text-accent-primary">
            Soon
        </span>
    );
}

function IntegrationCard({ name, children }: { name: string; children: ReactNode }) {
    return (
        <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5">
            <div className="flex items-center gap-3 mb-4">
                <h4 className="text-base font-medium text-twilight-text">{name}</h4>
                <SoonBadge />
            </div>
            <div className="flex flex-col gap-4">{children}</div>
        </div>
    );
}

export function IntegrationsTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const integrations = settings?.integrations ?? SETTINGS_DEFAULTS.integrations;
    // One typed patch per integration key keeps each switch to a single line.
    const patch = <K extends keyof Integrations>(key: K, value: Partial<Integrations[K]>) =>
        updateSettings.mutate({ integrations: { [key]: value } as Partial<Integrations> });
    const { googleCalendar, appleCalendar, notion, obsidian, ics } = integrations;

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Integrations</h2>

            <ConnectedAssistants />

            <h3 className="text-lg font-semibold text-twilight-text">Sync</h3>

            <div className="opacity-50 pointer-events-none" aria-disabled="true">
                <SettingsSection title="Calendar sync preferences">
                    <IntegrationCard name="Google Calendar">
                        <SwitchSetting
                            title="Enable sync"
                            description="Sync Cadence tasks to a dedicated Google Calendar."
                            checked={googleCalendar.enabled}
                            onChange={(val) => patch("googleCalendar", { enabled: val })}
                        />
                        <SelectSetting
                            title="Sync direction"
                            description="Choose one-way (Cadence → Google) or two-way sync."
                            value={googleCalendar.syncMode}
                            options={SYNC_OPTIONS}
                            widthClass="sm:max-w-[14rem]"
                            onChange={(val) => patch("googleCalendar", { syncMode: val as SyncMode })}
                        />
                        <SwitchSetting
                            title="Include completed tasks"
                            description="Sync completed tasks alongside active ones."
                            checked={googleCalendar.includeCompleted}
                            onChange={(val) => patch("googleCalendar", { includeCompleted: val })}
                        />
                    </IntegrationCard>

                    <IntegrationCard name="Apple Calendar">
                        <SwitchSetting
                            title="Enable sync"
                            description="Sync Cadence tasks to Apple Calendar via iCloud."
                            checked={appleCalendar.enabled}
                            onChange={(val) => patch("appleCalendar", { enabled: val })}
                        />
                        <SelectSetting
                            title="Sync direction"
                            description="Choose one-way or two-way sync."
                            value={appleCalendar.syncMode}
                            options={SYNC_OPTIONS}
                            widthClass="sm:max-w-[14rem]"
                            onChange={(val) => patch("appleCalendar", { syncMode: val as SyncMode })}
                        />
                    </IntegrationCard>
                </SettingsSection>

                <SettingsSection title="Notes & knowledge preferences">
                    <IntegrationCard name="Notion">
                        <SwitchSetting
                            title="Enable Notion integration"
                            description="Allow Cadence to create and link items in Notion."
                            checked={notion.enabled}
                            onChange={(val) => patch("notion", { enabled: val })}
                        />
                        <SwitchSetting
                            title="Create backlinks"
                            description="Automatically add backlinks from Notion pages to Cadence tasks."
                            checked={notion.createBacklinks}
                            onChange={(val) => patch("notion", { createBacklinks: val })}
                        />
                    </IntegrationCard>

                    <IntegrationCard name="Obsidian">
                        <SwitchSetting
                            title="Enable Obsidian integration"
                            description="Allow Cadence to interact with your Obsidian vault."
                            checked={obsidian.enabled}
                            onChange={(val) => patch("obsidian", { enabled: val })}
                        />
                        <SwitchSetting
                            title="Append task links"
                            description="Add links to Cadence tasks at the end of related Obsidian notes."
                            checked={obsidian.appendTaskLinks}
                            onChange={(val) => patch("obsidian", { appendTaskLinks: val })}
                        />
                    </IntegrationCard>
                </SettingsSection>

                <SettingsSection title="Calendar feed preferences">
                    <IntegrationCard name="ICS Calendar Feed">
                        <SwitchSetting
                            title="Enable ICS feed"
                            description="Generate a read-only ICS feed URL for subscribing in any calendar app."
                            checked={ics.enabled}
                            onChange={(val) => patch("ics", { enabled: val })}
                        />
                        <SwitchSetting
                            title="Include routines"
                            description="Add routines to the ICS feed alongside tasks."
                            checked={ics.includeHabits}
                            onChange={(val) => patch("ics", { includeHabits: val })}
                        />
                    </IntegrationCard>
                </SettingsSection>
            </div>
        </div>
    );
}
