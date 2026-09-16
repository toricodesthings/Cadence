import {
    AlertTriangle,
    ArrowDown,
    ArrowRight,
    ArrowUp,
    BatteryFull,
    BatteryLow,
    BatteryMedium,
    Minus,
    type LucideIcon,
} from "lucide-react";
import type { EffortLevel, TaskPriority } from "@cadence/contracts/task";

/** Icon-labelled choices shared by the create dialog and the task detail panel. */
export const PRIORITY_OPTIONS: { value: TaskPriority; label: string; icon: LucideIcon }[] = [
    { value: 0, label: "None", icon: Minus },
    { value: 1, label: "Low", icon: ArrowDown },
    { value: 2, label: "Medium", icon: ArrowRight },
    { value: 3, label: "High", icon: ArrowUp },
    { value: 4, label: "Urgent", icon: AlertTriangle },
];

export const EFFORT_OPTIONS: { value: Exclude<EffortLevel, null>; label: string; icon: LucideIcon }[] = [
    { value: 1, label: "Low", icon: BatteryLow },
    { value: 2, label: "Medium", icon: BatteryMedium },
    { value: 3, label: "High", icon: BatteryFull },
];

export const FIELD_LABEL = "text-[11px] font-medium uppercase tracking-[0.14em] text-twilight-text-soft";
export const CHIP_BASE = "flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";
export const CHIP_ACTIVE = "border-accent-primary/30 bg-accent-primary/15 text-accent-primary";
export const CHIP_IDLE = "border-white/[0.06] bg-white/[0.02] text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text";
