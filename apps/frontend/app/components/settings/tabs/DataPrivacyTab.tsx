import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Button } from "../../primitives";

export function DataPrivacyTab() {
    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Data & Privacy</h2>

            <div className="opacity-70">
                <SettingsSection title="Your Information">
                    <SettingsRow
                        title="Export Database (JSON/CSV)"
                        description="Request a package containing all of your historical Cadence data, tasks, memory artifacts, and logs."
                    >
                        <Button disabled variant="secondary" className="bg-white/5 border-white/10">Request Data</Button>
                    </SettingsRow>
                </SettingsSection>
            </div>

            <SettingsSection title="Danger Zone">
                <SettingsRow
                    title="Delete Account"
                    description="Permanently delete your account and destroy all associated records. This action is irreversible."
                >
                    <Button disabled variant="secondary" className="text-red-400 border-red-500/20 hover:bg-red-500/10">Delete Account</Button>
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
