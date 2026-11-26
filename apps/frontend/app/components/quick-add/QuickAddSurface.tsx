import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { CalendarHeart, CheckSquare, Flame, MessageSquare } from "lucide-react";
import { Composer, ComposerTabs } from "../shared/Composer";
import { useTaskComposer } from "../tasks/TaskComposer";
import { useCaptureComposer } from "../holding/CaptureInput";
import { useRoutineComposer } from "../habits/CreateHabitDialog";
import { usePersonalEventComposer } from "../events/PersonalEventEditorDialog";
import { useAddPersonalEvent } from "../calendar/AddPersonalEventDialog";
import { useTasks } from "../../hooks/tasks/use-tasks";
import { buildFocusSearchParams } from "../../hooks/search/use-route-focus";
import { trackUsageEvent } from "../../lib/api/track-event";

export type QuickAddTab = "task" | "capture" | "habit" | "event";

const TABS = [
    { id: "task", label: "Task", icon: CheckSquare },
    { id: "capture", label: "Thought", icon: MessageSquare },
    { id: "habit", label: "Routine", icon: Flame },
    {
        id: "event",
        label: "Event",
        icon: CalendarHeart,
        activeClassName: "bg-accent-nav-schedule/15 text-accent-nav-schedule",
    },
] as const;

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
    onComplete?: (route: string) => void;
}) {
    const [tab, setTab] = useState<QuickAddTab>(initialTab);
    const navigate = useNavigate();
    const { data: tasks = [] } = useTasks({ state: "ACTIVE" });

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
        onSaved: (created) =>
            finish(
                created ? "Task added to Capture" : "Task queued for sync",
                focusRoute("/", {
                    focusKind: "task",
                    focusId: created?.id ?? "",
                    focusScope: "holding-unmanaged",
                    focusSource: "quick-add",
                }),
            ),
    });
    const capture = useCaptureComposer({
        onSaved: (created) => {
            trackUsageEvent("capture.submitted", { surface: "quick_add", object_type: "capture" });
            if (mode !== "standalone") toast.success(created ? "Thought saved to Capture" : "Thought queued for sync");
            if (mode === "standalone")
                finish(
                    created ? "Thought saved to Capture" : "Thought queued for sync",
                    focusRoute("/", {
                        focusKind: "inbox",
                        focusId: created?.id ?? "",
                        focusScope: "holding-captures",
                        focusSource: "quick-add",
                    }),
                );
        },
    });
    const addPersonalEvent = useAddPersonalEvent();
    const routine = useRoutineComposer({
        onSaved: (created) =>
            finish(
                created ? "Routine created" : "Routine queued for sync",
                focusRoute("/routines", { focusKind: "habit", focusId: created?.id ?? "", focusSource: "quick-add" }),
            ),
    });
    const { titleRef: _eventTitleRef, ...event } = usePersonalEventComposer({
        open: open && tab === "event",
        onSubmit: (value) => {
            addPersonalEvent(value);
            finish("Event added", "/events");
        },
    });

    const drafts = { task, capture, habit: routine, event };
    const { reset: _reset, ...active } = drafts[tab];

    return (
        <Composer
            open={open}
            inline={mode === "standalone"}
            {...active}
            closeLabel={tab === "capture" && mode !== "standalone" ? "Done" : undefined}
            switcher={
                <ComposerTabs role="tablist" ariaLabel="What to add" value={tab} onChange={setTab} options={TABS} />
            }
            isDirty={task.isDirty || capture.isDirty || routine.isDirty || event.isDirty}
            discardDescription="This closes Quick Add and loses what you've typed in any tab."
            onClose={() => {
                task.reset();
                capture.reset();
                routine.reset();
                event.reset();
                onOpenChange(false);
            }}
        />
    );
}
