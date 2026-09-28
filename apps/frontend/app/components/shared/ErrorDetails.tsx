import { useState } from "react";
import { Copy } from "lucide-react";
import { errorRef } from "../../lib/log";

/**
 * The copyable ref under a crash screen, what a user sends to support
 * (`errorRef` plus the page). Dev adds the stack. Uses no router hooks:
 * the root boundary renders it when the router itself may have failed.
 */
export function ErrorDetails({ error }: { error: unknown }) {
    const [copied, setCopied] = useState(false);
    const ref = `${errorRef(error)} · ${typeof window === "undefined" ? "" : window.location.pathname}`;
    const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(ref);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard unavailable: the ref is still on screen to read out.
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-twilight-border bg-twilight-surface-muted px-3 py-2">
                <code className="min-w-0 break-all text-left text-[11px] leading-relaxed text-twilight-text-muted">{ref}</code>
                <button
                    type="button"
                    onClick={() => void copy()}
                    className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-twilight-text-muted transition-colors hover:text-twilight-text-soft"
                    aria-label="Copy error details"
                >
                    <Copy size={12} aria-hidden="true" />
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            {stack && (
                <pre className="max-h-64 overflow-auto rounded-xl border border-twilight-border bg-twilight-surface-muted p-4 text-left text-[11px] leading-relaxed text-twilight-text-soft">
                    <code>{stack}</code>
                </pre>
            )}
        </div>
    );
}
