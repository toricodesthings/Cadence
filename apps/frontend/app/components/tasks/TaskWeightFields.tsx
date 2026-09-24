import { CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE, EFFORT_ICON, EFFORT_OPTIONS, FIELD_LABEL, PRIORITY_ICON, PRIORITY_OPTIONS } from "./task-choice-options";
import type { EffortLevel, TaskPriority } from "@cadence/contracts/task";

/** Labelled priority chips for a composer's More fold. */
export function PriorityField({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }) {
    return (
        <div role="group" aria-label="Priority">
            <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                <PRIORITY_ICON size={12} aria-hidden="true" />
                Priority
            </span>
            <div className="grid grid-cols-5 gap-1.5">
                {PRIORITY_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            aria-label={`Priority: ${item.label}`}
                            aria-pressed={value === item.value}
                            onClick={() => onChange(item.value)}
                            className={`${CHIP_BASE} min-h-12 flex-col gap-0.5 sm:min-h-10 sm:flex-row sm:gap-1.5 ${value === item.value ? CHIP_ACTIVE : CHIP_IDLE}`}
                        >
                            <Icon size={14} aria-hidden="true" />
                            <span className="text-[10px] leading-none sm:text-xs sm:leading-normal">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** Labelled effort chips; tapping the chosen one clears it. */
export function EffortField({ value, onChange }: { value: EffortLevel; onChange: (value: EffortLevel) => void }) {
    return (
        <div role="group" aria-label="Effort">
            <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                <EFFORT_ICON size={12} aria-hidden="true" />
                Effort
            </span>
            <div className="grid grid-cols-3 gap-1.5">
                {EFFORT_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            aria-pressed={value === item.value}
                            onClick={() => onChange(value === item.value ? null : item.value)}
                            className={`${CHIP_BASE} ${value === item.value ? CHIP_ACTIVE : CHIP_IDLE}`}
                        >
                            <Icon size={13} aria-hidden="true" />
                            {item.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
