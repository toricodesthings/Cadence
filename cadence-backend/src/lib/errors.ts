export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

export function formatErrorResponse(error: unknown) {
    if (error instanceof AppError) {
        return {
            body: { error: { code: error.code, message: error.message } },
            status: error.statusCode,
        };
    }
    console.error("Unhandled:", error);
    return {
        body: {
            error: {
                code: "INTERNAL_ERROR",
                message: "An unexpected error occurred",
            },
        },
        status: 500,
    };
}
