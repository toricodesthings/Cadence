import type { Task } from "@cadence/contracts/task";

export function groupTasksBySection(tasks: Task[]) {
    const ungroupedTasks: Task[] = [];
    const sectionTaskMap = new Map<string, Task[]>();
    for (const task of tasks) {
        if (!task.sectionId) {
            ungroupedTasks.push(task);
        } else {
            const list = sectionTaskMap.get(task.sectionId) ?? [];
            list.push(task);
            sectionTaskMap.set(task.sectionId, list);
        }
    }
    return { ungroupedTasks, sectionTaskMap };
}
