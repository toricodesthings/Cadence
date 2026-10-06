import { useState } from "react";
import { formatShortDate } from "../../../lib/utils/date-format";
import { Switch, AlertDialog } from "../../primitives";
import { Button } from "../../primitives/Button";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";
import { DeleteAccountDialog } from "../DeleteAccountDialog";
import { useAuthState } from "../../../hooks/auth/use-auth-state";
import { useDataExport, useRequestDataExport } from "../../../hooks/core/use-data-export";

export function DataPrivacyTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
    const { session } = useAuthState();
    const email = session?.user.email ?? "your email";
    const { data: latest } = useDataExport();
    const requestExport = useRequestDataExport();

    const privacy = settings?.privacy ?? SETTINGS_DEFAULTS.privacy;

    // Matches the server's one-an-hour limit, so the button never offers a request it would refuse
    const exportBusy = requestExport.isPending || latest?.status === "pending"
        || (latest?.status === "sent" && Date.now() - new Date(latest.requestedAt).getTime() < 60 * 60 * 1000);
    const exportStatus = !latest
        ? `Get a JSON file with all your Cadence data, emailed to ${email}.`
        : latest.status === "pending"
            ? "Preparing your export. It will arrive by email shortly."
            : latest.status === "sent"
                ? `Last sent to ${latest.email} on ${formatShortDate(latest.completedAt ?? latest.requestedAt)}.`
                : "The last export didn't go through. Try again.";

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Privacy & Data</h2>

            {/* ── Privacy preferences ── */}
            <SettingsSection title="Privacy preferences">
                <SettingsRow
                    title="Usage diagnostics"
                    description="Share usage patterns and startup timings to help improve Cadence. No personal content is included."
                >
                    <Switch
                        checked={privacy.usageDiagnostics}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { usageDiagnostics: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Crash reports"
                    description="Share error types and app version to help fix crashes and failed actions. No personal content is included."
                >
                    <Switch
                        checked={privacy.crashReports}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { crashReports: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Local data preferences ── */}
            <SettingsSection title="Local data preferences">
                <SettingsRow
                    title="Store recent searches"
                    description="Keep recent search queries for quick access. Turning this off clears the history."
                >
                    <Switch
                        checked={privacy.storeRecentSearches}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { storeRecentSearches: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Export and deletion status ── */}
            <SettingsSection title="Export and deletion status">
                <SettingsRow title="Request data export" description={exportStatus}>
                    <AlertDialog.Root open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
                        <AlertDialog.Trigger asChild>
                            <Button variant="secondary" className="bg-white/5 border-white/10" disabled={exportBusy}>
                                {exportBusy ? "Preparing…" : "Email my data"}
                            </Button>
                        </AlertDialog.Trigger>
                        <AlertDialog.Content>
                            <AlertDialog.Header>
                                <AlertDialog.Title>Email your data</AlertDialog.Title>
                                <AlertDialog.Description>
                                    We'll email a JSON file with all your Cadence data to {email}. It usually arrives within a minute. You can ask once an hour.
                                </AlertDialog.Description>
                            </AlertDialog.Header>
                            <AlertDialog.Footer>
                                <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
                                <AlertDialog.Action onClick={() => requestExport.mutate()}>
                                    Send it
                                </AlertDialog.Action>
                            </AlertDialog.Footer>
                        </AlertDialog.Content>
                    </AlertDialog.Root>
                </SettingsRow>

                <SettingsRow
                    title="Delete account"
                    description="Permanently erase your account and everything in it. This cannot be undone."
                >
                    <DeleteAccountDialog />
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
