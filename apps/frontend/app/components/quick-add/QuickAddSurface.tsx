import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CheckSquare, Flame, MessageSquare } from "lucide-react";
import { Composer, ComposerTabs } from "../shared/Composer";
import { useTaskComposer } from "../tasks/TaskComposer";
import { useCaptureComposer } from "../holding/CaptureInput";
import { useRoutineComposer } from "../habits/CreateHabitDialog";
import { useTasks } from "../../hooks/tasks/use-tasks";
import { buildFocusSearchParams } from "../../hooks/search/use-route-focus";
import { trackUsageEvent } from "../../lib/api/track-event";

export type QuickAddTab = "task" | "capture" | "habit";

const TABS = [
    { id: "task", label: "Task", icon: CheckSquare },
    { id: "capture", label: "Thought", icon: MessageSquare },
    { id: "habit", label: "Routine", icon: Flame },
] as const;

/**
 * Quick Add: the task, thought and routine composers behind one type switch,
 * in the shared `Composer` (dialog on desktop, sheet on phones, in place in the
 * desktop quick-capture window). Each tab keeps its draft while you switch.
 */
export function QuickAddSurface({
    open,
    onOpenChange,
    initialTab = "task",
    mode = "dialog",
    onComplete,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialTab?: QuickAddTab;
    mode?: "dialog" | "standalone";
    /** Takes over the post-save navigation (the quick-capture window hands it to the main one). */
    onComplete?: (route: string) => void;
}) {
    const [tab, setTab] = useState<QuickAddTab>(initialTab);
    const navigate = useNavigate();
    const { data: tasks = [] } = useTasks({});

    useEffect(() => {
        if (open) setTab(initialTab);
    }, [initialTab, open]);

    const finish = (message: string, route: string) => {
        toast.success(message);
        onOpenChange(false);
        if (onComplete) onComplete(route);
        else navigate(route);
    };
    const focusRoute = (base: string, params: Parameters<typeof buildFocusSearchParams>[0]) =>
        params.focusId ? `${base}?${buildFocusSearchParams(params)}` : base;

    const task = useTaskComposer({
        open: open && tab === "task",
        tasks,
        onSaved: (created) => finish(
            created ? "Task added to Capture" : "Task queued for sync",
            focusRoute("/", { focusKind: "task", focusId: created?.id ?? "", focusScope: "holding-unmanaged", focusSource: "quick-add" }),
        ),
    });
    const capture = useCaptureComposer({
        onSaved: (created) => {
            trackUsageEvent("capture.submitted", { surface: "quick_add", object_type: "capture" });
            if (mode !== "standalone") toast.success(created ? "Thought saved to Capture" : "Thought queued for sync");
            if (mode === "standalone") finish(
                created ? "Thought saved to Capture" : "Thought queued for sync",
                focusRoute("/", { focusKind: "inbox", focusId: created?.id ?? "", focusScope: "holding-captures", focusSource: "quick-add" }),
            );
        },
    });
    const routine = useRoutineComposer({
        onSaved: (created) => finish(
            created ? "Routine created" : "Routine queued for sync",
            focusRoute("/routines", { focusKind: "habit", focusId: created?.id ?? "", focusSource: "quick-add" }),
        ),
    });

    const drafts = { task, capture, habit: routine };
    const { reset: _reset, ...active } = drafts[tab];

    return (
        <Composer
            open={open}
            inline={mode === "standalone"}
            {...active}
            // Thoughts save on each return and the tab stays open, so leaving is "Done".
            closeLabel={tab === "capture" && mode !== "standalone" ? "Done" : undefined}
            band={<ComposerTabs role="tablist" ariaLabel="What to add" value={tab} onChange={setTab} options={TABS} />}
            isDirty={task.isDirty || capture.isDirty || routine.isDirty}
            discardDescription="This closes Quick Add and loses what you've typed in any tab."
            onClose={() => {
                task.reset();
                capture.reset();
                routine.reset();
                onOpenChange(false);
            }}
        />
    );
}
