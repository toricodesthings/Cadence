import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Button } from "../../primitives";

export function IntegrationsTab() {
    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold text-twilight-text">
                External Integrations
                <span className="ml-2 rounded-full border border-twilight-border bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-twilight-text-soft">Coming Soon</span>
            </h2>

            <div className="opacity-50 pointer-events-none">
                <SettingsSection title="Calendars">
                    <SettingsRow
                        title="Google Calendar"
                        description="Two-way sync tasks to a dedicated Cadence calendar."
                    >
                        <Button disabled variant="secondary" className="bg-white/5 border-white/10">Connect</Button>
                    </SettingsRow>
                    <SettingsRow
                        title="Apple Calendar (iCloud)"
                    >
                        <Button disabled variant="secondary" className="bg-white/5 border-white/10">Connect</Button>
                    </SettingsRow>
                </SettingsSection>
                <SettingsSection title="Notes & Knowledge">
                    <SettingsRow
                        title="Obsidian Vault"
                        description="Automatically link tasks to notes."
                    >
                        <Button disabled variant="secondary" className="bg-white/5 border-white/10">Connect</Button>
                    </SettingsRow>
                    <SettingsRow
                        title="Notion"
                    >
                        <Button disabled variant="secondary" className="bg-white/5 border-white/10">Connect</Button>
                    </SettingsRow>
                </SettingsSection>
            </div>
        </div>
    );
}
