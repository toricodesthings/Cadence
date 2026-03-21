/**
 * Platform layer — cross-cutting infrastructure shared by all domains.
 *
 * Auth, DB access, RLS, error formatting, validation, logging, metrics,
 * and idempotency live here. Domain code imports from this layer;
 * this layer never imports from a domain.
 */

export { authMiddleware, isAdminUser, type AuthVariables } from "./auth";
export { getDbClient, type DbClient } from "./db";
export { withRls } from "./rls";
export { AppError, throwIfNotFound, assertNoConflict, createErrorBody, formatErrorResponse } from "./errors";
export { apiValidator } from "./validation";
export {
    REQUEST_ID_HEADER,
    createRequestContext,
    getRequestId,
    getRouteLabel,
    setRequestErrorCode,
    logValidationFailure,
    logErrorResponse,
    type ValidationIssueSummary,
} from "./request-log";
export { checkIdempotency, recordMutation, getIdempotencyKey } from "./idempotency";
export { assertOwnership, assertProjectOwnership, assertSectionOwnership, assertTagsOwnership } from "./ownership";
export {
    trackReschedule,
    trackCompletion,
    trackEvent,
    trackBatchCompletion,
    trackBatchEvents,
    computeWorkloadSignals,
} from "./metrics";
export {
    paginationSchema,
    type Pagination,
    uuidParamSchema,
    taskIdParamSchema,
    type ApiResponse,
    type ApiError,
} from "./common-schemas";
