export class AuthError extends Error {
    __isAuthError = true;
    constructor(
        message: string,
        public status?: number,
        public code?: string,
    ) {
        super(message);
        this.name = "AuthError";
    }
}

export class AuthApiError extends AuthError {
    constructor(message: string, status?: number, code?: string) {
        super(message, status, code);
        this.name = "AuthApiError";
    }
}

export function isAuthError(error: unknown): error is AuthError {
    return typeof error === "object" && error !== null && "__isAuthError" in error;
}

export function isAuthApiError(error: unknown): error is AuthApiError {
    return isAuthError(error) && error.name === "AuthApiError";
}
