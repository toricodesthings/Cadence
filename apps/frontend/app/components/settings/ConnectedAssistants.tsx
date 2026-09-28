import { useState } from "react";
import { Unplug } from "lucide-react";
import type { McpConnection } from "@cadence/contracts/connections";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { SettingsSection } from "./layout/SettingsLayout";
import { useConnections, useDisconnect } from "../../hooks/core/use-connections";
import { CADENCE_MCP_URL, MCP_SCOPE_COPY } from "../../lib/constants/mcp";
import { relativeTime } from "../../lib/utils/date-format";

/** Settings › Integrations: outside assistants connected through MCP, each with Disconnect. */
export function ConnectedAssistants() {
    const { data: connections, isPending, isError } = useConnections();

    return (
        <SettingsSection title="Connected assistants">
            <p className="text-sm leading-6 text-twilight-text-soft">
                Let an assistant you already use, like Claude, read your Cadence, add to Capture or change it. Add{" "}
                <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] text-twilight-text">{CADENCE_MCP_URL}</code>{" "}
                as a connector there, then approve it here. It can't change your settings.
            </p>
            {isError && <p className="text-sm text-twilight-text-soft">Couldn't load your connections.</p>}
            {!isPending && connections?.length === 0 && (
                <p className="text-sm text-twilight-text-muted">No assistants connected.</p>
            )}
            {connections?.map((connection) => <ConnectionRow key={connection.id} connection={connection} />)}
        </SettingsSection>
    );
}

function ConnectionRow({ connection }: { connection: McpConnection }) {
    const [open, setOpen] = useState(false);
    const disconnect = useDisconnect();
    const permissions = connection.scopes.map((scope) => MCP_SCOPE_COPY[scope].short).join(" · ");

    return (
        <div className="flex items-center justify-between gap-4 rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5">
            <div className="min-w-0">
                <h4 className="truncate text-base font-medium text-twilight-text">{connection.clientName}</h4>
                <p className="text-xs leading-5 text-twilight-text-soft">
                    {permissions} · {connection.redirectHost}
                </p>
                <p className="text-xs leading-5 text-twilight-text-muted">
                    {connection.lastUsedAt ? `Used ${relativeTime(connection.lastUsedAt, { suffix: " ago" })}` : "Not used yet"}
                </p>
            </div>
            <AlertDialog.Root open={open} onOpenChange={setOpen}>
                <AlertDialog.Trigger asChild>
                    <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" disabled={disconnect.isPending}>
                        <Unplug size={14} aria-hidden />
                        Disconnect
                    </Button>
                </AlertDialog.Trigger>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Disconnect {connection.clientName}?</AlertDialog.Title>
                        <AlertDialog.Description>
                            It stops working with your Cadence right away. What it already read or added stays where it
                            is. You can connect it again anytime.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">Cancel</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button variant="danger" size="md" onClick={() => disconnect.mutate(connection.id)}>
                                Disconnect
                            </Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </div>
    );
}
