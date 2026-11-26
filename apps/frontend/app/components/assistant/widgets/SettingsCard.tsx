import { Check, Settings2, Undo2 } from "lucide-react";
import type { DeepPartial, UserSettings } from "@cadence/contracts/settings";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { formatSettingValue, leafPaths, readPath, SETTING_LABELS } from "../../../lib/ai/settings-labels";
import { ApprovalCard, outcomeOf, type ToolRenderContext } from "./ApprovalCard";
import { useState } from "react";

type Row = { path: string; from: unknown; to: unknown };

function SettingRows({ rows }: { rows: Row[] }) {
    return (
        <ul className="space-y-1.5 rounded-lg bg-twilight-deep/40 p-2.5">
            {rows.map(({ path, from, to }) => {
                const meta = SETTING_LABELS[path];
                const Icon = meta?.icon ?? Settings2;
                return (
                    <li key={path} className="flex items-center gap-2 text-[12px] text-twilight-text">
                        <Icon size={13} className="shrink-0 text-accent-primary" aria-hidden />
                        <span className="min-w-0 flex-1 break-words">{meta?.label ?? path}</span>
                        <span className="shrink-0 text-twilight-text-soft">
                            {formatSettingValue(path, from)} → {formatSettingValue(path, to)}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

export function SettingsCard({ ctx }: { ctx: ToolRenderContext<"update_settings"> }) {
    const { part, stale } = ctx;
    const settings = useSettings().data;
    const update = useUpdateSettings();
    const [undone, setUndone] = useState(false);
    const output = part.output as
        | { changed?: { key: string; from: unknown; to: unknown }[]; undo?: object }
        | undefined;

    if (outcomeOf(part, stale) === "done" && output?.changed) {
        const { changed, undo } = output;
        if (changed.length === 0)
            return <span className="text-[12px] text-twilight-text-muted">Already set that way.</span>;
        return (
            <div
                role="status"
                className="w-full space-y-1.5 rounded-xl border border-accent-primary/20 bg-accent-primary/10 p-2.5"
            >
                <SettingRows rows={changed.map((c) => ({ path: c.key, from: c.from, to: c.to }))} />
                <div className="flex items-center gap-2 text-[11px] text-twilight-text-soft">
                    <Check size={12} className="text-feedback-success" aria-hidden />
                    {undone ? "Put back" : "Changed"}
                    {!undone && !stale && undo ? (
                        <button
                            type="button"
                            onClick={() => {
                                setUndone(true);
                                update.mutate(undo as DeepPartial<UserSettings>);
                            }}
                            className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-accent-primary hover:surface-item"
                        >
                            <Undo2 size={12} aria-hidden /> Undo
                        </button>
                    ) : null}
                </div>
            </div>
        );
    }

    const rows = leafPaths(part.input?.patch).map(({ path, value }) => ({
        path,
        from: readPath(settings, path),
        to: value,
    }));
    return (
        <ApprovalCard
            ctx={ctx}
            eyebrow="CHANGE SETTINGS"
            eyebrowGlyph={Settings2}
            ariaLabel="Change settings"
            primaryLabel="Change"
            primaryGlyph={Check}
            doneText="Settings changed."
        >
            <SettingRows rows={rows} />
        </ApprovalCard>
    );
}
