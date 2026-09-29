import { CloudUpload } from "lucide-react";
import { useIsUnsynced } from "../../lib/api/mutation-outbox";

/** A quiet mark after a title while a change to it waits to sync (made offline). */
export function PendingMark({ id }: { id: string | undefined }) {
    if (!useIsUnsynced(id)) return null;
    return (
        <span className="ml-1.5 inline-flex translate-y-[1px] align-baseline text-twilight-text-muted">
            <CloudUpload size={12} aria-hidden="true" />
            <span className="sr-only">(not synced yet)</span>
        </span>
    );
}
