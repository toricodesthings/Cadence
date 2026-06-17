import { z } from "zod";
import { taskStateSchema } from "@cadence/contracts/task";
import { paginationSchema } from "@cadence/contracts/common";
import { normalizeEndBoundary, normalizeStartBoundary } from "@cadence/domain/task-temporal";

// Canonical shapes (enums, insert/update/reorder/batch, Row/Entity) live in
// @cadence/contracts/task. This module re-exports them and keeps only the
// server-only filter/query schemas that depend on route normalizers.
export * from "@cadence/contracts/task";

const flexibleDateTimeSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const booleanQuerySchema = z
    .enum(["true", "false"])
    .transform((v) => v === "true");

const taskFiltersSchemaBase = z.object({
    state: taskStateSchema.optional(),
    projectId: z.uuid().optional(),
    scheduledDate: z.iso.date().optional(),
    scheduledRangeStart: flexibleDateTimeSchema.optional(),
    scheduledRangeEnd: flexibleDateTimeSchema.optional(),
    priority: z.coerce.number().int().min(0).max(4).optional(),
    isPinned: booleanQuerySchema.optional(),
    effort: z.coerce.number().int().min(1).max(3).optional(),
    notBeforeBefore: z.iso.datetime({ offset: true }).optional(), // tasks where not_before <= this date
    hasNoDate: booleanQuerySchema.optional(),
    hasNoProject: booleanQuerySchema.optional(),
    effectiveOnOrBeforeDate: z.iso.date().optional(),
});

function refineTaskFilters(value: z.infer<typeof taskFiltersSchemaBase>, ctx: z.RefinementCtx) {
    const hasRangeStart = value.scheduledRangeStart !== undefined;
    const hasRangeEnd = value.scheduledRangeEnd !== undefined;

    if (hasRangeStart !== hasRangeEnd) {
        ctx.addIssue({
            code: "custom",
            message: "scheduledRangeStart and scheduledRangeEnd must be provided together",
            path: hasRangeStart ? ["scheduledRangeEnd"] : ["scheduledRangeStart"],
        });
    }

    if (value.scheduledRangeStart && value.scheduledRangeEnd) {
        const start = new Date(normalizeStartBoundary(value.scheduledRangeStart)).getTime();
        const end = new Date(normalizeEndBoundary(value.scheduledRangeEnd)).getTime();

        if (Number.isFinite(start) && Number.isFinite(end) && start > end) {
            ctx.addIssue({
                code: "custom",
                message: "scheduledRangeEnd must be on or after scheduledRangeStart",
                path: ["scheduledRangeEnd"],
            });
        }
    }
}

export const taskFiltersSchema = taskFiltersSchemaBase.superRefine(refineTaskFilters);
export type TaskFilters = z.infer<typeof taskFiltersSchema>;

export const taskListQuerySchema = taskFiltersSchemaBase.extend(paginationSchema.shape).superRefine(refineTaskFilters);
