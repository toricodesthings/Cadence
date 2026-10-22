import { useState } from "react";
import { formatShortDate } from "../../../lib/utils/date-format";
import { Switch, AlertDialog } from "../../primitives";
import { Button } from "../../primitives/Button";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useApiClient } from "../../../hooks/auth/use-api-client";
import { unwrapResponse } from "../../../lib/api/helpers";
import { toastError } from "../../../lib/utils/error-toast";
import { clearRecentSearches } from "../../../lib/utils/recent-searches";
import { useAuthState } from "../../../hooks/auth/use-auth-state";
import { useDataExport, useRequestDataExport } from "../../../hooks/core/use-data-export";

type DataExport = ReturnType<typeof useDataExport>["data"];

/** What the export row says, and whether to hold the button: one an hour, matching the server's limit. */
function exportState(latest: DataExport, email: string, requesting: boolean) {
    // Matches the server's one-an-hour limit, so the button never offers a request it would refuse
    const busy = requesting || latest?.status === "pending"
        || (latest?.status === "sent" && Date.now() - new Date(latest.requestedAt).getTime() < 60 * 60 * 1000);
    return { busy, status: exportStatusText(latest, email) };
}

function exportStatusText(latest: DataExport, email: string) {
    if (!latest) return `Get a JSON file with all your Cadence data, emailed to ${email}.`;
    if (latest.status === "pending") return "Preparing your export. It will arrive by email shortly.";
    if (latest.status === "sent") return `Last sent to ${latest.email} on ${formatShortDate(latest.completedAt ?? latest.requestedAt)}.`;
    return "The last export didn't go through. Try again.";
}

/** Email my data, behind a confirm that says where it goes. */
function ExportRow({ email }: { email: string }) {
    const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
    const { data: latest } = useDataExport();
    const requestExport = useRequestDataExport();
    const { busy: exportBusy, status: exportStatus } = exportState(latest, email, requestExport.isPending);
    return (
        <SettingsRow title="Request data export" description={exportStatus}>
            <AlertDialog.Root open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
                <AlertDialog.Trigger asChild>
                    <Button variant="secondary" disabled={exportBusy}>
                        {exportBusy ? "Preparing…" : "Email my data"}
                    </Button>
                </AlertDialog.Trigger>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Email your data</AlertDialog.Title>
                        <AlertDialog.Description>
                            {`We'll email a JSON file with all your Cadence data to ${email}. It usually arrives within a minute. You can ask once an hour.`}
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
    );
}

export function DataPrivacyTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const { session } = useAuthState();
    const email = session?.user.email ?? "your email";

    const privacy = settings?.privacy ?? SETTINGS_DEFAULTS.privacy;
    const client = useApiClient();
    const [clearingHistory, setClearingHistory] = useState(false);

    const clearHistory = async () => {
        setClearingHistory(true);
        try {
            await unwrapResponse(await client.api.settings["intelligence-history"].clear.$post({}));
            updateSettings.mutate({ tasks: { intelligence: { dismissedEntityIds: [], dismissedEntities: [] } } });
            try {
                window.localStorage.removeItem("cadence_notification_state");
            } catch {
                // Ignore local storage failures and keep the successful server-side clear.
            }
            toast.success("Cleared stored intelligence history.");
        } catch (error) {
            toastError(error, "Couldn't clear intelligence history");
        } finally {
            setClearingHistory(false);
        }
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Data & Privacy</h2>

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
            <SettingsSection title="Stored data">
                <SettingsRow
                    title="Store recent searches"
                    description="Keep recent search queries for quick access. Turning this off clears the history."
                >
                    <Switch
                        checked={privacy.storeRecentSearches}
                        onCheckedChange={(val) => {
                            if (!val) clearRecentSearches();
                            updateSettings.mutate({ privacy: { storeRecentSearches: val } });
                        }}
                    />
                </SettingsRow>
                <SettingsRow
                    title="Clear intelligence history"
                    description="Remove stored parse snapshots and dismissed suggestions. Your tasks and routines aren't touched."
                >
                    <Button variant="secondary" disabled={clearingHistory} onClick={() => void clearHistory()}>
                        <Trash2 size={14} aria-hidden="true" />
                        {clearingHistory ? "Clearing…" : "Clear history"}
                    </Button>
                </SettingsRow>
            </SettingsSection>

            {/* ── Export and deletion status ── */}
            <SettingsSection title="Export">
                <ExportRow email={email} />

            </SettingsSection>
        </div>
    );
}
