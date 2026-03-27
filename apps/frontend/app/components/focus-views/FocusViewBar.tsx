import { useState, useCallback, useMemo, useEffect } from "react";
import { FOCUS_VIEW_PRESETS, composeFocusView } from "@cadence/nlp/focus-views";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { useCreateFocusView, useDeleteFocusView, useFocusViews, useUpdateFocusView } from "../../hooks/core/use-focus-views";
import { useSettings } from "../../hooks/core/use-settings";
import { useProjects } from "../../hooks/projects";
import { Zap, Clock, CalendarX2, UserCheck, Brain, CloudFog, Search, X, BookmarkPlus, Pin, Trash2, Pencil } from "lucide-react";
import * as Popover from "../primitives/Popover";
import * as ContextMenu from "../primitives/ContextMenu";

const PRESET_ICONS: Record<string, React.ReactNode> = {
    Zap: <Zap size={14} />,
    Clock: <Clock size={14} />,
    CalendarX: <CalendarX2 size={14} />,
    UserCheck: <UserCheck size={14} />,
    Brain: <Brain size={14} />,
    CloudFog: <CloudFog size={14} />,
};

/**
 * §8.1.2 Focus View Bar — compact popover trigger + active filter chip.
 *
 * Default: one compact "Focus" trigger (no more visual weight than a secondary button).
 * Active: shows a small active-filter chip with clear action.
 * On click: opens a popover containing preset pills, pinned views, and NL composer.
 * Auto-collapses after applying a filter.
 */
export function FocusViewBar() {
    const { data: userSettings } = useSettings();
    useFocusViews();
    const { data: projects = [] } = useProjects();
    const focusViewsEnabled = userSettings?.tasks?.intelligence?.focusViewsEnabled !== false;
    const intelligenceEnabled = userSettings?.tasks?.intelligence?.nlpEnabled !== false;
    const createFocusView = useCreateFocusView();
    const updateFocusView = useUpdateFocusView();
    const deleteFocusViewMutation = useDeleteFocusView();

    const {
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
    const [showComposer, setShowComposer] = useState(false);

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
        setShowComposer(false);
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

    if (!intelligenceEnabled || !focusViewsEnabled) return null;

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
                    activeDefinition
                        ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/25"
                        : "bg-white/[0.03] text-twilight-text-muted border border-twilight-border/30 hover:bg-white/[0.06]"
                }`}
            >
                <Zap size={14} aria-hidden="true" />
                {activeLabel ?? "Focus"}
                {activeLabel && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); clear(); }}
                        className="rounded-full p-0.5 hover:bg-accent-primary/20 transition-colors cursor-pointer"
                        aria-label="Clear focus view"
                    >
                        <X size={11} />
                    </button>
                )}
            </Popover.Trigger>

                <Popover.Content
                    align="start"
                    sideOffset={6}
                    className="w-80 max-h-[28rem] overflow-y-auto"
                >
                    {/* Section: Presets */}
                    <div className="mb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-twilight-text-muted/60 mb-2">
                            Presets
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {FOCUS_VIEW_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => handleSelectPreset(preset)}
                                    title={preset.description}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
                                        activePresetId === preset.id
                                            ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/25"
                                            : "bg-white/[0.04] text-twilight-text-soft border border-twilight-border/20 hover:bg-white/[0.08]"
                                    }`}
                                >
                                    {PRESET_ICONS[preset.icon] ?? null}
                                    {preset.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Section: Pinned views */}
                    {pinnedViews.length > 0 && (
                        <div className="mb-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-twilight-text-muted/60 mb-2">
                                Saved
                            </p>
                            <div className="flex flex-col gap-1">
                                {pinnedViews.map((view) => (
                                    <ContextMenu.Root key={view.id}>
                                        <ContextMenu.Trigger asChild>
                                            <button
                                                type="button"
                                                onClick={() => handleSelectSavedView(view.id)}
                                                className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-left transition-colors cursor-pointer ${
                                                    activeSavedViewId === view.id
                                                        ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/25"
                                                        : "bg-white/[0.04] text-twilight-text-soft border border-twilight-border/20 hover:bg-white/[0.08]"
                                                }`}
                                            >
                                                <Pin size={12} className="shrink-0 opacity-50" />
                                                {view.name}
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

                    {/* Section: NL Composer */}
                    <div className="border-t border-twilight-border/20 pt-3 mt-1">
                        {showComposer ? (
                            <div className="flex flex-col gap-2">
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={composerInput}
                                        onChange={(e) => setComposerInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleComposerSubmit();
                                            if (e.key === "Escape") {
                                                setShowComposer(false);
                                                setComposerInput("");
                                            }
                                        }}
                                        placeholder="e.g. overdue tasks with no project"
                                        className="w-full rounded-lg border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-[12px] text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-accent-primary/30 focus:ring-1 focus:ring-accent-primary/20 transition-colors"
                                        autoFocus
                                        aria-label="Describe a Focus View"
                                    />
                                    {composerInput && (
                                        <button
                                            type="button"
                                            onClick={() => setComposerInput("")}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-twilight-text-muted hover:text-twilight-text cursor-pointer"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                                {composerChips.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {composerChips.map((chip) => (
                                            <span
                                                key={chip}
                                                className="inline-flex items-center rounded-md bg-accent-primary/10 border border-accent-primary/18 px-2 py-0.5 text-[10px] font-medium text-accent-primary"
                                            >
                                                {chip}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={handleComposerSubmit}
                                    disabled={!composerInput.trim()}
                                    className="self-end rounded-lg bg-accent-primary/15 px-3 py-1.5 text-[12px] font-medium text-accent-primary hover:bg-accent-primary/25 transition-colors disabled:opacity-40 cursor-pointer"
                                >
                                    Apply
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowComposer(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer"
                            >
                                <Search size={13} />
                                Describe a custom filter…
                            </button>
                        )}
                    </div>

                    {/* Section: Actions */}
                    {activeDefinition && (
                        <div className="border-t border-twilight-border/20 pt-3 mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleSaveCurrent}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer"
                            >
                                <BookmarkPlus size={13} />
                                Save view
                            </button>
                            <button
                                type="button"
                                onClick={handleClearAndClose}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer"
                            >
                                <X size={13} />
                                Clear filter
                            </button>
                        </div>
                    )}
                </Popover.Content>
            </Popover.Root>
    );
}
