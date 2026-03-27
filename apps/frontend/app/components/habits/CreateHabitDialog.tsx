import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, Clock, FolderOpen, Tag, Sunrise, Dumbbell, Droplet, BookOpen } from "lucide-react";
import * as Dialog from "../primitives/Dialog";
import { TimePicker } from "../primitives";
import { Button } from "../primitives/Button";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { CadencePicker } from "./CadencePicker";
import { createHabitSchema, type CreateHabitValues } from "../../lib/validations/habit-schemas";

const HABIT_STARTER_PACKS: Array<{
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    recurrenceRule: string;
}> = [
    {
        id: "morning-review",
        title: "Morning review",
        description: "Check Today, clear Holding, and start with intention.",
        icon: Sunrise,
        recurrenceRule: "FREQ=DAILY",
    },
    {
        id: "workout-split",
        title: "Workout split",
        description: "Keep a steady training rhythm across the week.",
        icon: Dumbbell,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    },
    {
        id: "hydration",
        title: "Hydration",
        description: "A small daily reset that keeps the baseline healthy.",
        icon: Droplet,
        recurrenceRule: "FREQ=DAILY",
    },
    {
        id: "reading",
        title: "Reading",
        description: "Build a calm evening reading habit.",
        icon: BookOpen,
        recurrenceRule: "FREQ=DAILY",
    },
];

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateHabitDialog({ open, onOpenChange }: Props) {
    const { mutate: createHabit } = useCreateHabit();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();

    const [showStarterPacks, setShowStarterPacks] = useState(false);
    const [showTiming, setShowTiming] = useState(false);
    const [showConnections, setShowConnections] = useState(false);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

    const form = useForm<CreateHabitValues>({
        resolver: zodResolver(createHabitSchema),
        defaultValues: {
            title: "",
            description: "",
            recurrenceRule: "FREQ=DAILY",
            colorAccent: "lantern",
            targetTime: null,
            reminderEnabled: false,
            projectId: null,
            tagIds: [],
        },
    });

    const watchTargetTime = form.watch("targetTime");

    const handleClose = () => {
        form.reset();
        setShowStarterPacks(false);
        setShowTiming(false);
        setShowConnections(false);
        setSelectedTagIds([]);
        onOpenChange(false);
    };

    const onSubmit = (data: CreateHabitValues) => {
        createHabit({
            ...data,
            tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        });
        handleClose();
    };

    const toggleTag = (tagId: string) => {
        setSelectedTagIds((prev) =>
            prev.includes(tagId)
                ? prev.filter((id) => id !== tagId)
                : [...prev, tagId]
        );
    };

    return (
        <Dialog.Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
            <Dialog.DialogContent className="max-w-xl">
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>New routine</Dialog.DialogTitle>
                    <Dialog.DialogDescription>
                        Start with a name — add timing and connections when you're ready.
                    </Dialog.DialogDescription>
                </Dialog.DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 mt-2">
                    {/* Starter packs — collapsible horizontal carousel */}
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => setShowStarterPacks((v) => !v)}
                            className="flex items-center gap-2 text-left cursor-pointer group"
                        >
                            <motion.div animate={{ rotate: showStarterPacks ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                <ChevronRight size={12} className="text-twilight-text-muted/50" />
                            </motion.div>
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted group-hover:text-twilight-text transition-colors">
                                Starter packs
                            </span>
                        </button>

                        <AnimatePresence initial={false}>
                            {showStarterPacks && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="grid grid-cols-4 gap-2">
                                        {HABIT_STARTER_PACKS.map((preset) => (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                onClick={() => {
                                                    form.setValue("title", preset.title, { shouldDirty: true });
                                                    form.setValue("description", preset.description, { shouldDirty: true });
                                                    form.setValue("recurrenceRule", preset.recurrenceRule, { shouldDirty: true });
                                                }}
                                                className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-4 text-center transition-colors hover:bg-white/[0.06] hover:border-accent-primary/20 cursor-pointer"
                                            >
                                                <preset.icon size={22} className="text-accent-primary/70 shrink-0" />
                                                <span className="text-[12px] font-semibold text-twilight-text leading-tight">{preset.title}</span>
                                                <span className="text-[11px] leading-snug text-twilight-text-muted/60 line-clamp-2">{preset.description}</span>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Level 1: Name + Cadence (always visible) */}
                    <div className="flex flex-col gap-1.5">
                        <input
                            id="habit-title"
                            autoFocus
                            placeholder="Name this routine…"
                            {...form.register("title")}
                            className="w-full border-b border-white/[0.10] bg-transparent pb-3 font-display text-xl text-twilight-text outline-none placeholder:text-twilight-text-muted/50 transition-[border-color] duration-200 focus:border-accent-primary/40"
                        />
                        {form.formState.errors.title && (
                            <span className="text-rose-500 text-xs mt-1">{form.formState.errors.title.message}</span>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                            Cadence
                        </label>
                        <Controller
                            control={form.control}
                            name="recurrenceRule"
                            render={({ field }) => (
                                <CadencePicker value={field.value} onChange={field.onChange} />
                            )}
                        />
                    </div>

                    {/* Level 2: Timing disclosure */}
                    <div className="flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={() => setShowTiming((v) => !v)}
                            className="flex items-center gap-2 text-left cursor-pointer group"
                        >
                            <Clock size={14} className="text-twilight-text-muted/60" />
                            <span className="text-sm font-medium text-twilight-text-soft group-hover:text-twilight-text transition-colors">
                                Timing &amp; reminder
                            </span>
                            {!showTiming && watchTargetTime && (
                                <span className="text-[11px] text-twilight-text-muted/70 ml-1">
                                    — {watchTargetTime}{form.watch("reminderEnabled") ? ", reminder on" : ""}
                                </span>
                            )}
                            <motion.div animate={{ rotate: showTiming ? 180 : 0 }} transition={{ duration: 0.15 }}>
                                <ChevronDown size={12} className="text-twilight-text-muted/50" />
                            </motion.div>
                        </button>

                        <AnimatePresence initial={false}>
                            {showTiming && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                                Target time <span className="normal-case tracking-normal font-normal text-twilight-text-muted/40">— optional</span>
                                            </label>
                                            <div className="flex items-center gap-2">
                                                {watchTargetTime ? (
                                                    <>
                                                        <Controller
                                                            control={form.control}
                                                            name="targetTime"
                                                            render={({ field }) => (
                                                                <TimePicker
                                                                    value={field.value ?? "09:00"}
                                                                    onChange={field.onChange}
                                                                />
                                                            )}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => form.setValue("targetTime", null)}
                                                            className="px-3 py-2 rounded-xl text-[12px] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors cursor-pointer"
                                                        >
                                                            Clear
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => form.setValue("targetTime", "09:00", { shouldDirty: true })}
                                                        className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text transition-colors cursor-pointer"
                                                    >
                                                        <Clock size={14} />
                                                        Set a target time
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {watchTargetTime && (
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    {...form.register("reminderEnabled")}
                                                    className="h-5 w-5 rounded-lg border-white/[0.15] bg-white/[0.05] text-accent-primary focus:ring-accent-primary/40 accent-[var(--accent-primary)]"
                                                />
                                                <span className="text-sm text-twilight-text-soft">
                                                    Remind me at this time
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Level 3: Connections disclosure */}
                    <div className="flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={() => setShowConnections((v) => !v)}
                            className="flex items-center gap-2 text-left cursor-pointer group"
                        >
                            <FolderOpen size={14} className="text-twilight-text-muted/60" />
                            <span className="text-sm font-medium text-twilight-text-soft group-hover:text-twilight-text transition-colors">
                                Project, tags &amp; purpose
                            </span>
                            {!showConnections && (() => {
                                const parts: string[] = [];
                                const pid = form.watch("projectId");
                                if (pid) {
                                    const proj = projects.find(p => p.id === pid);
                                    if (proj) parts.push(proj.name);
                                }
                                if (selectedTagIds.length > 0) parts.push(`${selectedTagIds.length} tag${selectedTagIds.length > 1 ? "s" : ""}`);
                                return parts.length > 0 ? (
                                    <span className="text-[11px] text-twilight-text-muted/70 ml-1 truncate">
                                        — {parts.join(", ")}
                                    </span>
                                ) : null;
                            })()}
                            <motion.div animate={{ rotate: showConnections ? 180 : 0 }} transition={{ duration: 0.15 }}>
                                <ChevronDown size={12} className="text-twilight-text-muted/50" />
                            </motion.div>
                        </button>

                        <AnimatePresence initial={false}>
                            {showConnections && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                        {/* Purpose */}
                                        <div className="flex flex-col gap-1.5">
                                            <label htmlFor="habit-desc" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                                Purpose <span className="normal-case tracking-normal font-normal text-twilight-text-muted/40">— optional</span>
                                            </label>
                                            <textarea
                                                id="habit-desc"
                                                placeholder="Why are you building this routine?"
                                                {...form.register("description")}
                                                rows={2}
                                                className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none transition-[border-color,box-shadow] duration-200 focus:border-accent-primary/30 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)] resize-none"
                                            />
                                        </div>

                                        {/* Project link */}
                                        {projects.length > 0 && (
                                            <div className="flex flex-col gap-1.5">
                                                <label htmlFor="habit-project" className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                                    Link to project
                                                </label>
                                                <select
                                                    id="habit-project"
                                                    {...form.register("projectId")}
                                                    className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text outline-none transition-[border-color,box-shadow] duration-200 focus:border-accent-primary/30 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)] appearance-none"
                                                >
                                                    <option value="">None</option>
                                                    {projects.map((p) => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* Tags */}
                                        {tags.length > 0 && (
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted">
                                                    Tags
                                                </label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tags.map((tag) => {
                                                        const selected = selectedTagIds.includes(tag.id);
                                                        return (
                                                            <button
                                                                key={tag.id}
                                                                type="button"
                                                                onClick={() => toggleTag(tag.id)}
                                                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer ${
                                                                    selected
                                                                        ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/25"
                                                                        : "bg-white/[0.04] text-twilight-text-muted border border-white/[0.08] hover:bg-white/[0.07] hover:text-twilight-text"
                                                                }`}
                                                            >
                                                                <Tag size={10} />
                                                                {tag.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="md"
                            onClick={handleClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            disabled={!form.formState.isDirty || form.formState.isSubmitting}
                            className="bg-accent-primary/18 text-accent-primary hover:bg-accent-primary/26 disabled:opacity-40"
                        >
                            Create routine
                        </Button>
                    </div>
                </form>
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}
