import { z } from "zod";

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
