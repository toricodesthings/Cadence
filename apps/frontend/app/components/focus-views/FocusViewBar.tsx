import { useState, useCallback, useMemo, useEffect } from "react";
import { FOCUS_VIEW_PRESETS, composeFocusView } from "@cadence/nlp/focus-views";
import { useFocusViewStore, type CaptureOrder } from "../../stores/focus-view-store";
import { useCreateFocusView, useDeleteFocusView, useFocusViews, useUpdateFocusView } from "../../hooks/core/use-focus-views";
import { useSettings } from "../../hooks/core/use-settings";
import { useProjects } from "../../hooks/projects/use-projects";
import { Zap, Clock, CalendarX2, UserCheck, Brain, CloudFog, Sparkles, ArrowRight, ArrowDown, ArrowUp, Flag, Check, X, BookmarkPlus, Pin, Trash2, Pencil } from "lucide-react";
import * as Popover from "../primitives/Popover";
import * as ContextMenu from "../primitives/ContextMenu";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { UtilitySheet } from "../shared/UtilitySheet";
import { Tip } from "../primitives";
import { SegmentedControl } from "../primitives/SegmentedControl";

/** Each preset's icon and a quiet hue for its bubble, so the six read apart at a glance. */
const PRESET_ICONS: Record<string, { icon: React.ReactNode; tone: string }> = {
    Zap: { icon: <Zap size={15} />, tone: "var(--color-lantern)" },
    Clock: { icon: <Clock size={15} />, tone: "var(--color-sapphire)" },
    CalendarX: { icon: <CalendarX2 size={15} />, tone: "var(--color-moonlit)" },
    UserCheck: { icon: <UserCheck size={15} />, tone: "var(--color-forest-green)" },
    Brain: { icon: <Brain size={15} />, tone: "var(--color-violet)" },
    CloudFog: { icon: <CloudFog size={15} />, tone: "var(--color-moonlit)" },
};

const SECTION_LABEL = "mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-twilight-text-muted";

/**
 * §8.1.2 Focus View Bar — compact popover trigger + active filter chip.
 *
 * Default: one compact "Focus" trigger (no more visual weight than a secondary button).
 * Active: the trigger names the filter. On click: a popover with the describe
 * field on top, preset tiles (name + what it shows), pinned views, and Save/Clear
 * for an active filter. Auto-collapses after applying a filter.
 */
const ORDER_LABELS: Partial<Record<CaptureOrder, string>> = { oldest: "Oldest", priority: "Priority" };

type SavedFocusView = ReturnType<typeof useFocusViewStore.getState>["savedViews"][number];

/** A human-readable label for the active filter: the preset or saved view's name, else Custom. */
function activeLabelFor(presetId: string | null, savedViewId: string | null, definition: unknown, savedViews: SavedFocusView[]) {
    if (presetId) return FOCUS_VIEW_PRESETS.find((p) => p.id === presetId)?.name ?? presetId;
    if (savedViewId) return savedViews.find((v) => v.id === savedViewId)?.name ?? "Saved view";
    return definition ? "Custom" : null;
}

type ComposerFieldProps = { value: string; onChange: (value: string) => void; onSubmit: () => void; chips: string[] };

/** "Describe what you want to see": typed words become a filter, with the rules they matched as chips. */
function ComposerField({ value, onChange, onSubmit, chips }: ComposerFieldProps) {
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") onSubmit();
        if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
        }
    };
    return (
        <div>
            <div className="group relative flex min-h-11 items-center gap-2.5 rounded-2xl border border-twilight-border/30 bg-white/[0.03] px-3.5 transition-colors focus-within:border-accent-primary/35 focus-within:bg-white/[0.05]">
                <Sparkles size={15} aria-hidden="true" className="shrink-0 text-twilight-text-muted transition-colors group-focus-within:text-accent-primary" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Describe what you want to see…"
                    aria-label="Describe a Focus View"
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[13px] text-twilight-text outline-none placeholder:text-twilight-text-muted"
                />
                {value.trim() ? (
                    <button
                        type="button"
                        onClick={onSubmit}
                        aria-label="Apply filter"
                        className="-mr-1.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent-primary/15 text-accent-primary transition-colors hover:bg-accent-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <ArrowRight size={15} aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            {chips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1 px-1">
                    {chips.map((chip) => (
                        <span key={chip} className="inline-flex items-center rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-primary">
                            {chip}
                        </span>
                    ))}
                </div>
            ) : value.trim() ? null : (
                <p className="mt-1.5 px-1 text-[11px] text-twilight-text-muted">e.g. overdue tasks with no list</p>
            )}
        </div>
    );
}

type SavedViewsProps = { views: SavedFocusView[]; activeId: string | null; onSelect: (viewId: string) => void };

/** Pinned saved views; each one renames, unpins or deletes from its context menu. */
function SavedViews({ views, activeId, onSelect }: SavedViewsProps) {
    const updateFocusView = useUpdateFocusView();
    const deleteFocusViewMutation = useDeleteFocusView();
    const rename = (view: SavedFocusView) => {
        const nextName = window.prompt("Rename Focus View", view.name);
        if (nextName !== null && nextName.trim()) {
            updateFocusView.mutate({ id: view.id, name: nextName.trim() });
        }
    };
    return (
        <div>
            <p className={SECTION_LABEL}>Saved</p>
            <div className="flex flex-col gap-0.5">
                {views.map((view) => (
                    <ContextMenu.Root key={view.id}>
                        <ContextMenu.Trigger asChild>
                            <button
                                type="button"
                                onClick={() => onSelect(view.id)}
                                aria-pressed={activeId === view.id}
                                className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-2xl px-3 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                    activeId === view.id
                                        ? "bg-accent-primary/12 text-accent-primary"
                                        : "text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text"
                                }`}
                            >
                                <Pin size={13} aria-hidden="true" className="shrink-0 opacity-60" />
                                <span className="min-w-0 flex-1 truncate">{view.name}</span>
                            </button>
                        </ContextMenu.Trigger>
                        <ContextMenu.Content>
                            <ContextMenu.Item onSelect={() => rename(view)}>
                                <Pencil size={14} className="mr-2 opacity-60" />
                                Rename
                            </ContextMenu.Item>
                            <ContextMenu.Item
                                onSelect={() => updateFocusView.mutate({ id: view.id, isPinned: false })}
                            >
                                <Pin size={14} className="mr-2 opacity-60" />
                                Unpin
                            </ContextMenu.Item>
                            <ContextMenu.Separator />
                            <ContextMenu.Item
                                variant="danger"
                                onSelect={() => deleteFocusViewMutation.mutate(view.id)}
                            >
                                <Trash2 size={14} className="mr-2" />
                                Delete
                            </ContextMenu.Item>
                        </ContextMenu.Content>
                    </ContextMenu.Root>
                ))}
            </div>
        </div>
    );
}

type ActiveViewBarProps = { label: string | null; onSave: (() => void) | null; onClear: () => void };

/** "Showing …" with Save (unless it is already a saved view) and Clear. */
function ActiveViewBar({ label, onSave, onClear }: ActiveViewBarProps) {
    return (
        <div className="flex items-center gap-1 rounded-2xl bg-accent-primary/[0.08] py-1 pl-3.5 pr-1">
            <span className="min-w-0 flex-1 truncate text-[12px] text-twilight-text-soft">
                Showing <span className="font-medium text-accent-primary">{label}</span>
            </span>
            {onSave && (
                <button
                    type="button"
                    onClick={onSave}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    <BookmarkPlus size={13} aria-hidden="true" />
                    Save
                </button>
            )}
            <button
                type="button"
                onClick={onClear}
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                <X size={13} aria-hidden="true" />
                Clear
            </button>
        </div>
    );
}

type FocusPreset = (typeof FOCUS_VIEW_PRESETS)[number];
type PresetButtonProps = { preset: FocusPreset; active: boolean; onSelect: (preset: FocusPreset) => void };

/** One preset: its icon in its tone (a check while active), name and description. */
function PresetButton({ preset, active, onSelect }: PresetButtonProps) {
    const look = PRESET_ICONS[preset.icon];
    return (
        <button
            type="button"
            onClick={() => onSelect(preset)}
            aria-pressed={active}
            style={{ "--preset-tone": look?.tone ?? "var(--accent-primary)" } as React.CSSProperties}
            className={`group flex min-h-11 cursor-pointer items-start gap-2.5 rounded-2xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                active
                    ? "border-[color-mix(in_srgb,var(--preset-tone)_35%,transparent)] bg-[color-mix(in_srgb,var(--preset-tone)_12%,transparent)]"
                    : "border-transparent bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
        >
            <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--preset-tone)] transition-colors ${active ? "bg-[color-mix(in_srgb,var(--preset-tone)_22%,transparent)]" : "bg-[color-mix(in_srgb,var(--preset-tone)_12%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--preset-tone)_18%,transparent)]"}`}>
                {active ? <Check size={15} strokeWidth={2.75} /> : look?.icon ?? null}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-twilight-text">{preset.name}</span>
                <span className="text-[11px] leading-snug text-twilight-text-muted">{preset.description}</span>
            </span>
        </button>
    );
}

/** The trigger's words: the capture order when it isn't Newest, then the active view; "Focus" with neither. */
function triggerLabels(capture: boolean, captureOrder: CaptureOrder, activeLabel: string | null) {
    const orderLabel = capture ? ORDER_LABELS[captureOrder] ?? null : null;
    return { orderLabel, triggerLabel: [orderLabel, activeLabel].filter(Boolean).join(" · ") || "Focus" };
}

type CaptureOrderPickerProps = { value: CaptureOrder; onChange: (order: CaptureOrder) => void };

function CaptureOrderPicker({ value, onChange }: CaptureOrderPickerProps) {
    return (
        <div>
            <p className={SECTION_LABEL}>Order</p>
            <SegmentedControl
                size="sm"
                ariaLabel="Order"
                value={value}
                onChange={onChange}
                options={[{ value: "newest", label: "Newest", icon: <ArrowDown size={13} aria-hidden="true" /> }, { value: "oldest", label: "Oldest", icon: <ArrowUp size={13} aria-hidden="true" /> }, { value: "priority", label: "Priority", icon: <Flag size={13} aria-hidden="true" /> }]}
                className="w-full [&>button]:flex-1"
            />
        </div>
    );
}

type FocusTriggerProps = {
    label: string;
    orderLabel: string | null;
    active: boolean;
    open: boolean;
    setOpen: (open: boolean) => void;
    content: React.ReactNode;
};

/** Phones: an icon button (with the order when it isn't Newest) opening a sheet. */
function CompactFocusTrigger({ label, orderLabel, active, open, setOpen, content }: FocusTriggerProps) {
    const name = label === "Focus" ? "Focus" : `Focus: ${label}`;
    return <>
        <Tip label={name}><button type="button" aria-label={name} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={`mobile-icon-button relative ${orderLabel ? "!w-auto gap-1 px-2" : ""} ${active || orderLabel ? "bg-accent-primary/15 text-accent-primary" : ""}`}>
            <Zap size={20} aria-hidden="true" />
            {orderLabel && <span className="text-xs">{orderLabel}</span>}
            {active && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent-primary" />}
        </button></Tip>
        <UtilitySheet title="Focus" open={open} onClose={() => setOpen(false)}>
            <p className="text-sm text-twilight-text-soft">Choose what you want to see right now.</p>
            {content}
        </UtilitySheet>
    </>;
}

/** Wider screens: a labelled trigger opening a popover. */
function FocusPopover({ label, active, open, setOpen, content }: FocusTriggerProps) {
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
                className={`shrink-0 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition-colors ${
                    active
                        ? "surface-control-accent text-accent-primary border border-accent-primary/25"
                        : "surface-control text-twilight-text-muted border border-twilight-border/30 hover:text-twilight-text"
                }`}
            >
                <Zap size={14} aria-hidden="true" />
                {label}
            </Popover.Trigger>

                <Popover.Content
                    align="start"
                    sideOffset={6}
                    className="w-[23rem] max-h-[32rem] overflow-y-auto rounded-3xl p-3"
                >
                    {content}
                </Popover.Content>
            </Popover.Root>
    );
}

export function FocusViewBar({ capture = false }: { capture?: boolean }) {
    const shell = useShellMode();
    const { data: userSettings } = useSettings();
    useFocusViews();
    const { data: projects = [] } = useProjects();
    const intelligence = userSettings?.tasks?.intelligence;
    const enabled = intelligence?.nlpEnabled !== false && intelligence?.focusViewsEnabled !== false;
    const createFocusView = useCreateFocusView();

    const {
        captureOrder, setCaptureOrder,
        activePresetId,
        activeSavedViewId,
        activeDefinition,
        composerInput,
        savedViews,
        setPreset,
        setCustomDefinition,
        setComposerInput,
        applySavedView,
        clearActiveDefinition,
        clear,
    } = useFocusViewStore();

    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!enabled && activeDefinition) {
            clearActiveDefinition();
        }
    }, [activeDefinition, clearActiveDefinition, enabled]);

    const handleComposerSubmit = useCallback(() => {
        if (!composerInput.trim()) return;
        const result = composeFocusView(composerInput, {
            projects: projects.map((p) => ({ id: p.id, name: p.name })),
        });
        if (result.matchedPreset) {
            setPreset(result.matchedPreset);
        } else {
            setCustomDefinition(result.definition);
        }
        setOpen(false);
    }, [composerInput, projects, setPreset, setCustomDefinition]);

    const handleSelectPreset = useCallback((preset: (typeof FOCUS_VIEW_PRESETS)[number]) => {
        if (activePresetId === preset.id) {
            clear();
        } else {
            setPreset(preset);
        }
        setOpen(false);
    }, [activePresetId, clear, setPreset]);

    const handleSelectSavedView = useCallback((viewId: string) => {
        applySavedView(viewId);
        setOpen(false);
    }, [applySavedView]);

    const handleClearAndClose = useCallback(() => {
        clear();
        setOpen(false);
    }, [clear]);

    const handleSaveCurrent = useCallback(() => {
        if (!activeDefinition) return;
        createFocusView.mutate({
            name: composerInput.trim() || "Saved view",
            definition: activeDefinition,
            isPinned: true,
            source: activePresetId ? "preset" : "composed",
            orderIndex: savedViews.length > 0
                ? Math.max(...savedViews.map((view) => view.orderIndex)) + 1
                : 0,
        });
    }, [activeDefinition, activePresetId, composerInput, createFocusView, savedViews]);

    const composerChips = useMemo(() => {
        if (!composerInput.trim()) return [];
        const result = composeFocusView(composerInput, {
            projects: projects.map((p) => ({ id: p.id, name: p.name })),
        });
        return result.matchedRules;
    }, [composerInput, projects]);

    const pinnedViews = useMemo(
        () => savedViews
            .filter((view) => view.isPinned)
            .sort((a, b) => a.orderIndex - b.orderIndex),
        [savedViews],
    );

    /** Derive a human-readable label for the active filter */
    const activeLabel = useMemo(
        () => activeLabelFor(activePresetId, activeSavedViewId, activeDefinition, savedViews),
        [activePresetId, activeSavedViewId, activeDefinition, savedViews],
    );

    if (!enabled && !capture) return null;

    const content = <div className={`flex flex-col gap-4 ${shell.isCompact ? "mobile-focus-options" : ""}`}>
        <ComposerField value={composerInput} onChange={setComposerInput} onSubmit={handleComposerSubmit} chips={composerChips} />

        {capture && <CaptureOrderPicker value={captureOrder} onChange={(order) => { setCaptureOrder(order); setOpen(false); }} />}

        <div>
            <p className={SECTION_LABEL}>Presets</p>
            <div className={`grid gap-1.5 ${shell.isCompact ? "grid-cols-1" : "grid-cols-2"}`}>
                {FOCUS_VIEW_PRESETS.map((preset) => (
                    <PresetButton key={preset.id} preset={preset} active={activePresetId === preset.id} onSelect={handleSelectPreset} />
                ))}
            </div>
        </div>

        {pinnedViews.length > 0 && <SavedViews views={pinnedViews} activeId={activeSavedViewId} onSelect={handleSelectSavedView} />}

        {activeDefinition && <ActiveViewBar label={activeLabel} onSave={activeSavedViewId ? null : handleSaveCurrent} onClear={handleClearAndClose} />}
    </div>;

    const { orderLabel, triggerLabel } = triggerLabels(capture, captureOrder, activeLabel);

    const triggerProps = { label: triggerLabel, orderLabel, active: Boolean(activeDefinition), open, setOpen, content };
    return shell.isCompact ? <CompactFocusTrigger {...triggerProps} /> : <FocusPopover {...triggerProps} />;

}
