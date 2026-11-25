import { useState, useCallback, useMemo, useEffect } from "react";
import { useFocusViewUrl } from "../../hooks/ui/use-focus-view-url";
import { FOCUS_VIEW_PRESETS, composeFocusView } from "@cadence/nlp/focus-views";
import { useFocusViewStore, type CaptureOrder, type SavedFocusView } from "../../stores/focus-view-store";
import {
    useCreateFocusView,
    useDeleteFocusView,
    useFocusViews,
    useUpdateFocusView,
} from "../../hooks/core/use-focus-views";
import { useSettings } from "../../hooks/core/use-settings";
import { useProjects } from "../../hooks/projects/use-projects";
import { useDeviceFlag } from "../../hooks/ui/use-device-flag";
import { Zap, Sparkles, ArrowRight, ArrowDown, ArrowUp, ChevronRight, Flag, X, BookmarkPlus } from "lucide-react";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { UtilitySheet } from "../shared/UtilitySheet";
import { Reveal } from "../shared/Reveal";
import { Tip } from "../primitives";
import { HEADER_LABEL_BUTTON } from "../layout/PageHeader";
import * as Dialog from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { SegmentedControl } from "../primitives/SegmentedControl";
import { FocusPresetList, type PresetActions } from "./FocusPresetList";
import { FocusViewEditor, type FocusViewLook } from "./FocusViewEditor";

/**
 * Focus: one header button opening a dialog (a sheet on a touch phone). What's showing comes first, then every
 * preset (built-in or saved, searchable, each with its own menu), then the folded ways to make a new view or
 * change Capture's order. Picking a view closes it.
 */
const ORDER_LABELS: Record<CaptureOrder, string> = { newest: "Newest", oldest: "Oldest", priority: "Priority" };

/** A wash of the text colour: visible over any room, lightening at night and darkening by day. */
const HOVER = "hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]";

const presetFor = (view: SavedFocusView) =>
    view.presetKey ? FOCUS_VIEW_PRESETS.find((p) => p.id === view.presetKey) : undefined;

/** A human-readable label for the active filter: the view's own (maybe renamed) name, else Custom. */
function activeLabelFor(
    presetId: string | null,
    savedViewId: string | null,
    definition: unknown,
    savedViews: SavedFocusView[],
) {
    if (presetId)
        return (
            savedViews.find((v) => v.presetKey === presetId)?.name ??
            FOCUS_VIEW_PRESETS.find((p) => p.id === presetId)?.name ??
            presetId
        );
    if (savedViewId) return savedViews.find((v) => v.id === savedViewId)?.name ?? "Saved view";
    return definition ? "Custom" : null;
}

type FoldSectionProps = {
    id: string;
    title: string;
    /** What's inside, said while folded (the current order). */
    summary?: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
};

/** One accordion step: the whole header folds it, with the chevron turning to show which way. */
function FoldSection({ id, title, summary, open, onToggle, children }: FoldSectionProps) {
    return (
        <section>
            <h3>
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={id}
                    onClick={onToggle}
                    className={`group/fold press press-none flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-full px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${HOVER}`}
                >
                    <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className={`shrink-0 text-twilight-text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                    />
                    <span className="text-sm font-medium text-twilight-text-soft transition-colors group-hover/fold:text-twilight-text">
                        {title}
                    </span>
                    {summary ? <span className="ml-auto pr-2 text-xs text-twilight-text-muted">{summary}</span> : null}
                </button>
            </h3>
            <Reveal open={open} id={id}>
                <div className="px-0.5 pb-1 pt-2">{children}</div>
            </Reveal>
        </section>
    );
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
            <div
                data-focus-container
                className="group relative flex min-h-12 items-center gap-3 rounded-full border border-twilight-border/40 surface-control pl-4 pr-2 transition-colors focus-within:border-accent-primary/40"
            >
                <Sparkles
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-twilight-text-muted transition-colors group-focus-within:text-accent-primary"
                />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Describe what you want to see…"
                    aria-label="Describe a Focus View"
                    className="min-w-0 flex-1 bg-transparent py-3 text-sm text-twilight-text outline-none placeholder:text-twilight-text-muted focus:placeholder:text-twilight-text-soft"
                />
                {value.trim() ? (
                    <button
                        type="button"
                        onClick={onSubmit}
                        aria-label="Apply filter"
                        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary transition-colors hover:bg-accent-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <ArrowRight size={15} aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            {chips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1 px-3">
                    {chips.map((chip) => (
                        <span
                            key={chip}
                            className="inline-flex items-center rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-primary"
                        >
                            {chip}
                        </span>
                    ))}
                </div>
            ) : value.trim() ? null : (
                <p className="mt-1.5 px-4 text-xs text-twilight-text-muted">e.g. overdue tasks with no list</p>
            )}
        </div>
    );
}

type ActiveViewBarProps = { label: string | null; onSave: (() => void) | null; onClear: () => void };

/** "Showing …" with Save (unless it is already a saved view) and Clear. */
function ActiveViewBar({ label, onSave, onClear }: ActiveViewBarProps) {
    return (
        <div className="flex min-h-12 items-center gap-1 rounded-full bg-accent-primary/10 py-1.5 pl-4 pr-1.5">
            <span className="min-w-0 flex-1 truncate text-sm text-twilight-text-soft">
                Showing <span className="font-medium text-accent-primary">{label}</span>
            </span>
            {onSave && (
                <button
                    type="button"
                    onClick={onSave}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-twilight-text-soft transition-colors hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    <BookmarkPlus size={13} aria-hidden="true" />
                    Save
                </button>
            )}
            <button
                type="button"
                onClick={onClear}
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-twilight-text-soft transition-colors hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                <X size={13} aria-hidden="true" />
                Clear
            </button>
        </div>
    );
}

/** The trigger's words: the capture order when it isn't Newest, then the active view; "Focus" with neither. */
function triggerLabels(capture: boolean, captureOrder: CaptureOrder, activeLabel: string | null) {
    const orderLabel = capture && captureOrder !== "newest" ? ORDER_LABELS[captureOrder] : null;
    return { orderLabel, triggerLabel: [orderLabel, activeLabel].filter(Boolean).join(" · ") || "Focus" };
}

type CaptureOrderPickerProps = { value: CaptureOrder; onChange: (order: CaptureOrder) => void };

function CaptureOrderPicker({ value, onChange }: CaptureOrderPickerProps) {
    return (
        <SegmentedControl
            size="sm"
            ariaLabel="Order"
            value={value}
            onChange={onChange}
            options={[
                { value: "newest", label: "Newest", icon: <ArrowDown size={13} aria-hidden="true" /> },
                { value: "oldest", label: "Oldest", icon: <ArrowUp size={13} aria-hidden="true" /> },
                { value: "priority", label: "Priority", icon: <Flag size={13} aria-hidden="true" /> },
            ]}
            className="w-full [&>button]:flex-1"
        />
    );
}

type FocusTriggerProps = {
    label: string;
    orderLabel: string | null;
    active: boolean;
    open: boolean;
    setOpen: (open: boolean) => void;
};

/** Compact headers: an icon button (with the order when it isn't Newest). */
function CompactFocusTrigger({ label, orderLabel, active, open, setOpen }: FocusTriggerProps) {
    const name = label === "Focus" ? "Focus" : `Focus: ${label}`;
    return (
        <Tip label={name}>
            <button
                type="button"
                aria-label={name}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className={`mobile-icon-button relative ${orderLabel ? "!w-auto gap-1 px-2" : ""} ${active || orderLabel ? "bg-accent-primary/15 text-accent-primary" : ""}`}
            >
                <Zap size={20} aria-hidden="true" />
                {orderLabel && <span className="text-xs">{orderLabel}</span>}
                {active && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent-primary" />}
            </button>
        </Tip>
    );
}

/** Wider headers: a labelled button naming the active view. */
function FocusTrigger({ label, active, open, setOpen }: FocusTriggerProps) {
    return (
        <Tip label="Show only what matters now" side="bottom">
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className={`${HEADER_LABEL_BUTTON} ${active ? "surface-control-accent border-accent-primary/25 text-accent-primary" : ""}`}
            >
                <Zap size={16} aria-hidden="true" />
                {label}
            </button>
        </Tip>
    );
}

type FocusSurfaceProps = { open: boolean; setOpen: (open: boolean) => void; children: React.ReactNode };

/** Like Share: a dialog with a mouse, a sheet on a touch phone (its ✓ closes it). */
function FocusSurface({ open, setOpen, children }: FocusSurfaceProps) {
    const { isPhone, isTouch } = useShellMode();
    if (isPhone && isTouch)
        return (
            <UtilitySheet title="Focus" open={open} onClose={() => setOpen(false)}>
                {children}
            </UtilitySheet>
        );
    return (
        <Dialog.Dialog open={open} onOpenChange={setOpen}>
            <Dialog.DialogContent className="w-[min(calc(100vw-1.5rem),40rem)] sm:max-w-[40rem]">
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle className="flex items-center gap-2">
                        <Zap size={18} aria-hidden="true" className="shrink-0" />
                        Focus
                    </Dialog.DialogTitle>
                    <Dialog.DialogDescription className="sr-only">
                        Choose what this page shows right now.
                    </Dialog.DialogDescription>
                </Dialog.DialogHeader>
                {children}
                <div className="flex border-t border-twilight-border/60 pt-3">
                    <Button variant="primary" size="md" className="ml-auto min-w-24" onClick={() => setOpen(false)}>
                        Done
                    </Button>
                </div>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}

type Editing = { title: string; submitLabel: string; look: FocusViewLook; submit: (look: FocusViewLook) => void };

export function FocusViewBar({ capture = false }: { capture?: boolean }) {
    const shell = useShellMode();
    const { data: userSettings } = useSettings();
    useFocusViews();
    const { data: projects = [] } = useProjects();
    const intelligence = userSettings?.tasks?.intelligence;
    const enabled = intelligence?.nlpEnabled !== false && intelligence?.focusViewsEnabled !== false;
    const createFocusView = useCreateFocusView();
    const updateFocusView = useUpdateFocusView();
    const deleteFocusView = useDeleteFocusView();
    const [presetsFolded, setPresetsFolded] = useDeviceFlag("focus-presets-folded");
    const [describeOpen, setDescribeOpen] = useDeviceFlag("focus-describe-open");
    const [orderOpen, setOrderOpen] = useDeviceFlag("focus-order-open");
    const [editing, setEditing] = useState<Editing | null>(null);

    const {
        captureOrder,
        setCaptureOrder,
        activePresetId,
        activeSavedViewId,
        activeDefinition,
        composerInput,
        savedViews,
        setPreset,
        setCustomDefinition,
        setComposerInput,
        applySavedView,
        hydrateSavedViews,
        clearActiveDefinition,
        clear,
    } = useFocusViewStore();

    const [open, setOpen] = useState(false);
    useFocusViewUrl(capture);

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

    const isActive = useCallback(
        (view: SavedFocusView) =>
            view.id === activeSavedViewId || (Boolean(view.presetKey) && view.presetKey === activePresetId),
        [activePresetId, activeSavedViewId],
    );

    const actions: PresetActions = {
        // A built-in applies as its preset, so `?focus=quick-wins` links keep working; picking the active one clears.
        onSelect: (view) => {
            const preset = presetFor(view);
            if (isActive(view)) clear();
            else if (preset) setPreset(preset);
            else applySavedView(view.id);
            setOpen(false);
        },
        onEdit: (view) =>
            setEditing({
                title: "Edit preset",
                submitLabel: "Save",
                look: { name: view.name, icon: view.icon ?? null, color: view.color ?? null },
                submit: (look) => updateFocusView.mutate({ id: view.id, ...look }),
            }),
        onTogglePin: (view) => updateFocusView.mutate({ id: view.id, isPinned: !view.isPinned }),
        onDelete: (view) => {
            if (isActive(view)) clear();
            deleteFocusView.mutate({ id: view.id, name: view.name });
        },
    };

    const handleClearAndClose = useCallback(() => {
        clear();
        setOpen(false);
    }, [clear]);

    /** Derive a human-readable label for the active filter */
    const activeLabel = useMemo(
        () => activeLabelFor(activePresetId, activeSavedViewId, activeDefinition, savedViews),
        [activePresetId, activeSavedViewId, activeDefinition, savedViews],
    );

    // Saving goes through the same name/icon/colour dialog; the new preset lands above the others and becomes the view.
    const handleSaveCurrent = () => {
        if (!activeDefinition) return;
        const definition = activeDefinition;
        setEditing({
            title: "Save as preset",
            submitLabel: "Save preset",
            look: {
                name: composerInput.trim() || (activeLabel === "Custom" ? "" : (activeLabel ?? "")),
                icon: null,
                color: null,
            },
            submit: (look) =>
                createFocusView.mutate(
                    {
                        ...look,
                        definition,
                        isPinned: false,
                        source: "composed",
                        orderIndex: savedViews.length > 0 ? Math.min(...savedViews.map((v) => v.orderIndex)) - 1 : 0,
                    },
                    {
                        onSuccess: (row) => {
                            hydrateSavedViews([...useFocusViewStore.getState().savedViews, row]);
                            applySavedView(row.id);
                        },
                    },
                ),
        });
    };

    const composerChips = useMemo(() => {
        if (!composerInput.trim()) return [];
        const result = composeFocusView(composerInput, {
            projects: projects.map((p) => ({ id: p.id, name: p.name })),
        });
        return result.matchedRules;
    }, [composerInput, projects]);

    if (!enabled && !capture) return null;

    const alreadySaved =
        Boolean(activeSavedViewId) || savedViews.some((v) => v.presetKey && v.presetKey === activePresetId);

    const content = (
        <div className="flex flex-col gap-3">
            {activeDefinition && (
                <ActiveViewBar
                    label={activeLabel}
                    onSave={alreadySaved ? null : handleSaveCurrent}
                    onClear={handleClearAndClose}
                />
            )}

            <FoldSection
                id="focus-presets"
                title="Presets"
                summary={presetsFolded ? String(savedViews.length) : undefined}
                open={!presetsFolded}
                onToggle={() => setPresetsFolded(!presetsFolded)}
            >
                <FocusPresetList views={savedViews} isActive={isActive} actions={actions} />
            </FoldSection>

            <FoldSection
                id="focus-describe"
                title="Describe a new view"
                open={describeOpen}
                onToggle={() => setDescribeOpen(!describeOpen)}
            >
                <ComposerField
                    value={composerInput}
                    onChange={setComposerInput}
                    onSubmit={handleComposerSubmit}
                    chips={composerChips}
                />
            </FoldSection>

            {capture && (
                <FoldSection
                    id="focus-order"
                    title="Order"
                    summary={orderOpen ? undefined : ORDER_LABELS[captureOrder]}
                    open={orderOpen}
                    onToggle={() => setOrderOpen(!orderOpen)}
                >
                    <CaptureOrderPicker
                        value={captureOrder}
                        onChange={(order) => {
                            setCaptureOrder(order);
                            setOpen(false);
                        }}
                    />
                </FoldSection>
            )}

            <FocusViewEditor
                initial={editing?.look ?? null}
                title={editing?.title ?? ""}
                submitLabel={editing?.submitLabel ?? "Save"}
                onSubmit={(look) => editing?.submit(look)}
                onClose={() => setEditing(null)}
            />
        </div>
    );

    const { orderLabel, triggerLabel } = triggerLabels(capture, captureOrder, activeLabel);

    const triggerProps = { label: triggerLabel, orderLabel, active: Boolean(activeDefinition), open, setOpen };
    return (
        <>
            {shell.isCompact ? <CompactFocusTrigger {...triggerProps} /> : <FocusTrigger {...triggerProps} />}
            <FocusSurface open={open} setOpen={setOpen}>
                {content}
            </FocusSurface>
        </>
    );
}
