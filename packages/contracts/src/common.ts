import { z } from "zod";

/** ISO-8601 datetime with an offset — the wire format for every timestamp. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** A date-only (`YYYY-MM-DD`) or full ISO datetime, for fields shared by all-day and timed values. */
export const flexibleDateTimeSchema = z.union([z.iso.date(), isoDateTimeSchema]);

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const uuidParamSchema = z.object({ id: z.uuid() });
export const taskIdParamSchema = z.object({ taskId: z.uuid() });

export interface ApiResponse<T> {
    data: T;
    meta?: { total?: number; limit?: number; offset?: number };
}

export interface ApiError {
    error: {
        code: string;
        message: string;
        status?: number;
        isRetryable?: boolean;
        details?: unknown;
        issues?: Array<{ code: string; message: string; path: string }>;
    };
}
