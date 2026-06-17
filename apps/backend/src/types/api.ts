/**
 * Shared API contract types and request schemas.
 *
 * Canonical now in @cadence/contracts/common (envelope, pagination, id params).
 * Re-exported here so existing backend route imports keep working unchanged.
 */
export {
    paginationSchema,
    uuidParamSchema,
    taskIdParamSchema,
    type Pagination,
    type ApiResponse,
    type ApiError,
} from "@cadence/contracts/common";
