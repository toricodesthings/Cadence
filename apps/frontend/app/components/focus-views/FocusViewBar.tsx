import { useState, useCallback, useMemo, useEffect } from "react";
import { FOCUS_VIEW_PRESETS, composeFocusView } from "@cadence/nlp/focus-views";
import { useFocusViewStore } from "../../stores/focus-view-store";
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
export function FocusViewBar({ capture = false }: { capture?: boolean }) {
    const shell = useShellMode();
    const { data: userSettings } = useSettings();
    useFocusViews();
    const { data: projects = [] } = useProjects();
    const focusViewsEnabled = userSettings?.tasks?.intelligence?.focusViewsEnabled !== false;
    const intelligenceEnabled = userSettings?.tasks?.intelligence?.nlpEnabled !== false;
    const createFocusView = useCreateFocusView();
    const updateFocusView = useUpdateFocusView();
    const deleteFocusViewMutation = useDeleteFocusView();

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
        if ((!intelligenceEnabled || !focusViewsEnabled) && activeDefinition) {
            clearActiveDefinition();
        }
    }, [activeDefinition, clearActiveDefinition, focusViewsEnabled, intelligenceEnabled]);

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
    const activeLabel = useMemo(() => {
        if (activePresetId) {
            const preset = FOCUS_VIEW_PRESETS.find((p) => p.id === activePresetId);
            return preset?.name ?? activePresetId;
        }
        if (activeSavedViewId) {
            const saved = savedViews.find((v) => v.id === activeSavedViewId);
            return saved?.name ?? "Saved view";
        }
        if (activeDefinition) return "Custom";
        return null;
    }, [activePresetId, activeSavedViewId, activeDefinition, savedViews]);

    if ((!intelligenceEnabled || !focusViewsEnabled) && !capture) return null;

    const content = <div className={`flex flex-col gap-4 ${shell.isCompact ? "mobile-focus-options" : ""}`}>
        <div>
            <div className="group relative flex min-h-11 items-center gap-2.5 rounded-2xl border border-twilight-border/30 bg-white/[0.03] px-3.5 transition-colors focus-within:border-accent-primary/35 focus-within:bg-white/[0.05]">
                <Sparkles size={15} aria-hidden="true" className="shrink-0 text-twilight-text-muted transition-colors group-focus-within:text-accent-primary" />
                <input
                    type="text"
                    value={composerInput}
                    onChange={(e) => setComposerInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleComposerSubmit();
                        if (e.key === "Escape" && composerInput) {
                            e.stopPropagation();
                            setComposerInput("");
                        }
                    }}
                    placeholder="Describe what you want to see…"
                    aria-label="Describe a Focus View"
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[13px] text-twilight-text outline-none placeholder:text-twilight-text-muted"
                />
                {composerInput.trim() ? (
                    <button
                        type="button"
                        onClick={handleComposerSubmit}
                        aria-label="Apply filter"
                        className="-mr-1.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent-primary/15 text-accent-primary transition-colors hover:bg-accent-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <ArrowRight size={15} aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            {composerChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1 px-1">
                    {composerChips.map((chip) => (
                        <span key={chip} className="inline-flex items-center rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-primary">
                            {chip}
                        </span>
                    ))}
                </div>
            ) : composerInput.trim() ? null : (
                <p className="mt-1.5 px-1 text-[11px] text-twilight-text-muted">e.g. overdue tasks with no list</p>
            )}
        </div>

        {capture && (
            <div>
                <p className={SECTION_LABEL}>Order</p>
                <SegmentedControl
                    size="sm"
                    ariaLabel="Order"
                    value={captureOrder}
                    onChange={(order) => { setCaptureOrder(order); setOpen(false); }}
                    options={[{ value: "newest", label: "Newest", icon: <ArrowDown size={13} aria-hidden="true" /> }, { value: "oldest", label: "Oldest", icon: <ArrowUp size={13} aria-hidden="true" /> }, { value: "priority", label: "Priority", icon: <Flag size={13} aria-hidden="true" /> }]}
                    className="w-full [&>button]:flex-1"
                />
            </div>
        )}

        <div>
            <p className={SECTION_LABEL}>Presets</p>
            <div className={`grid gap-1.5 ${shell.isCompact ? "grid-cols-1" : "grid-cols-2"}`}>
                {FOCUS_VIEW_PRESETS.map((preset) => {
                    const active = activePresetId === preset.id;
                    const look = PRESET_ICONS[preset.icon];
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleSelectPreset(preset)}
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
                })}
            </div>
        </div>

        {pinnedViews.length > 0 && (
            <div>
                <p className={SECTION_LABEL}>Saved</p>
                <div className="flex flex-col gap-0.5">
                    {pinnedViews.map((view) => (
                        <ContextMenu.Root key={view.id}>
                            <ContextMenu.Trigger asChild>
                                <button
                                    type="button"
                                    onClick={() => handleSelectSavedView(view.id)}
                                    aria-pressed={activeSavedViewId === view.id}
                                    className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-2xl px-3 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                        activeSavedViewId === view.id
                                            ? "bg-accent-primary/12 text-accent-primary"
                                            : "text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text"
                                    }`}
                                >
                                    <Pin size={13} aria-hidden="true" className="shrink-0 opacity-60" />
                                    <span className="min-w-0 flex-1 truncate">{view.name}</span>
                                </button>
                            </ContextMenu.Trigger>
                            <ContextMenu.Content>
                                <ContextMenu.Item
                                    onSelect={() => {
                                        const nextName = window.prompt("Rename Focus View", view.name);
                                        if (nextName !== null && nextName.trim()) {
                                            updateFocusView.mutate({ id: view.id, name: nextName.trim() });
                                        }
                                    }}
                                >
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
        )}

        {activeDefinition && (
            <div className="flex items-center gap-1 rounded-2xl bg-accent-primary/[0.08] py-1 pl-3.5 pr-1">
                <span className="min-w-0 flex-1 truncate text-[12px] text-twilight-text-soft">
                    Showing <span className="font-medium text-accent-primary">{activeLabel}</span>
                </span>
                {!activeSavedViewId && (
                    <button
                        type="button"
                        onClick={handleSaveCurrent}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <BookmarkPlus size={13} aria-hidden="true" />
                        Save
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleClearAndClose}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    <X size={13} aria-hidden="true" />
                    Clear
                </button>
            </div>
        )}
    </div>;

    const orderLabel = capture && captureOrder !== "newest" ? (captureOrder === "oldest" ? "Oldest" : "Priority") : null;
    const triggerLabel = [orderLabel, activeLabel].filter(Boolean).join(" · ") || "Focus";

    if (shell.isCompact) return <>
        <Tip label={triggerLabel === "Focus" ? "Focus" : `Focus: ${triggerLabel}`}><button type="button" aria-label={triggerLabel === "Focus" ? "Focus" : `Focus: ${triggerLabel}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={`mobile-icon-button relative ${orderLabel ? "!w-auto gap-1 px-2" : ""} ${activeDefinition || orderLabel ? "bg-accent-primary/15 text-accent-primary" : ""}`}>
            <Zap size={20} aria-hidden="true" />
            {orderLabel && <span className="text-xs">{orderLabel}</span>}
            {activeDefinition && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent-primary" />}
        </button></Tip>
        <UtilitySheet title="Focus" open={open} onClose={() => setOpen(false)}>
            <p className="text-sm text-twilight-text-soft">Choose what you want to see right now.</p>
            {content}
        </UtilitySheet>
    </>;

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
                className={`shrink-0 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition-colors ${
                    activeDefinition
                        ? "surface-control-accent text-accent-primary border border-accent-primary/25"
                        : "surface-control text-twilight-text-muted border border-twilight-border/30 hover:text-twilight-text"
                }`}
            >
                <Zap size={14} aria-hidden="true" />
                {triggerLabel}
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
