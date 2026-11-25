import { useMemo, useState } from "react";
import { Check, EllipsisVertical, Pencil, Pin, Trash2 } from "lucide-react";
import { FOCUS_VIEW_PRESETS } from "@cadence/nlp/focus-views";
import * as ContextMenu from "../primitives/ContextMenu";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { SearchField } from "../primitives/SearchField";
import { Tip } from "../primitives";
import type { SavedFocusView } from "../../stores/focus-view-store";
import { FocusBubble, toneOf } from "./focus-look";

/** A wash of the text colour: visible over any room, lightening at night and darkening by day. */
const HOVER = "hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]";

const describe = (view: SavedFocusView) =>
    view.presetKey ? FOCUS_VIEW_PRESETS.find((p) => p.id === view.presetKey)?.description : undefined;

/** Pinned first, then newest saves above the built-ins (lower order index), as the server sorts. */
const byPlace = (a: SavedFocusView, b: SavedFocusView) =>
    Number(b.isPinned) - Number(a.isPinned) || a.orderIndex - b.orderIndex;

export type PresetActions = {
    onSelect: (view: SavedFocusView) => void;
    onEdit: (view: SavedFocusView) => void;
    onTogglePin: (view: SavedFocusView) => void;
    onDelete: (view: SavedFocusView) => void;
};

type MenuParts = Pick<typeof DropdownMenu, "Item" | "Separator">;

/** The same three actions in the ⋮ menu and on right-click. */
function PresetMenuItems({
    parts: M,
    view,
    actions,
}: {
    parts: MenuParts;
    view: SavedFocusView;
    actions: PresetActions;
}) {
    return (
        <>
            <M.Item onSelect={() => actions.onEdit(view)}>
                <Pencil size={14} aria-hidden="true" />
                Edit
            </M.Item>
            <M.Item onSelect={() => actions.onTogglePin(view)}>
                <Pin size={14} aria-hidden="true" />
                {view.isPinned ? "Unpin" : "Pin to top"}
            </M.Item>
            <M.Separator />
            <M.Item variant="danger" onSelect={() => actions.onDelete(view)}>
                <Trash2 size={14} aria-hidden="true" />
                Delete
            </M.Item>
        </>
    );
}

function PresetRow({ view, active, actions }: { view: SavedFocusView; active: boolean; actions: PresetActions }) {
    const description = describe(view);
    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
                <li
                    style={{ "--tone": toneOf(view.color) } as React.CSSProperties}
                    className={`group flex items-center gap-1 rounded-2xl pr-1 transition-colors ${
                        active
                            ? "bg-[color-mix(in_srgb,var(--tone)_12%,transparent)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--tone)_32%,transparent)]"
                            : HOVER
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => actions.onSelect(view)}
                        aria-pressed={active}
                        className="press flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl py-2.5 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        {active ? (
                            <span
                                aria-hidden="true"
                                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tone)_24%,transparent)] text-[var(--tone)]"
                            >
                                <Check size={15} strokeWidth={2.75} />
                            </span>
                        ) : (
                            <FocusBubble icon={view.icon} color={view.color} />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-sm font-medium text-twilight-text">{view.name}</span>
                            {description ? (
                                <span className="truncate text-xs text-twilight-text-muted">{description}</span>
                            ) : null}
                        </span>
                    </button>
                    {view.isPinned ? (
                        <Pin size={12} aria-label="Pinned" className="shrink-0 rotate-45 text-accent-primary" />
                    ) : null}
                    <DropdownMenu.Root>
                        <Tip label="View options">
                            <DropdownMenu.Trigger
                                aria-label={`Options for ${view.name}`}
                                className={`glass-inset flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 data-[state=open]:text-twilight-text ${HOVER}`}
                            >
                                <EllipsisVertical size={16} aria-hidden="true" />
                            </DropdownMenu.Trigger>
                        </Tip>
                        <DropdownMenu.Content align="end">
                            <PresetMenuItems parts={DropdownMenu} view={view} actions={actions} />
                        </DropdownMenu.Content>
                    </DropdownMenu.Root>
                </li>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
                <PresetMenuItems parts={ContextMenu} view={view} actions={actions} />
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}

type FocusPresetListProps = {
    views: SavedFocusView[];
    isActive: (view: SavedFocusView) => boolean;
    actions: PresetActions;
};

/** Every preset, built-in or saved, in one searchable list. */
export function FocusPresetList({ views, isActive, actions }: FocusPresetListProps) {
    const [query, setQuery] = useState("");
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return views.filter((v) => !q || `${v.name} ${describe(v) ?? ""}`.toLowerCase().includes(q)).sort(byPlace);
    }, [views, query]);

    return (
        <div className="flex flex-col gap-2">
            <SearchField
                value={query}
                onValueChange={setQuery}
                aria-label="Search presets"
                placeholder="Search presets"
                size="md"
                className="rounded-full"
            />
            {shown.length > 0 ? (
                // Only the card scrolls: about four and a half rows show, the cut row and the fade saying there's more.
                <div className="rounded-[22px] surface-item p-1.5">
                    <ul
                        aria-label="Presets"
                        className="fade-scroll-y flex max-h-[17.75rem] flex-col gap-0.5 rounded-2xl"
                    >
                        {shown.map((view) => (
                            <PresetRow key={view.id} view={view} active={isActive(view)} actions={actions} />
                        ))}
                    </ul>
                </div>
            ) : (
                <p role="status" className="px-3 py-4 text-center text-sm text-twilight-text-soft">
                    {views.length === 0
                        ? "No presets yet. Save a view to keep it here."
                        : `No presets match “${query.trim()}”`}
                </p>
            )}
        </div>
    );
}
