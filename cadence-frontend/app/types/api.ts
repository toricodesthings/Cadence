/** Standard API success envelope */
export interface ApiResponse<T> {
    data: T;
    meta?: { total?: number; limit?: number; offset?: number };
}

/** Standard API error envelope */
export interface ApiError {
    error: { code: string; message: string };
}
