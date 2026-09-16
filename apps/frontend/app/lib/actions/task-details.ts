export const OPEN_TASK_DETAILS_EVENT = "cadence:open-task-details";

export function openTaskDetails(taskId: string) {
    window.dispatchEvent(new CustomEvent<string>(OPEN_TASK_DETAILS_EVENT, { detail: taskId }));
}
