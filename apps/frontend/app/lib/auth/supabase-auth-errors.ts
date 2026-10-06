/**
 * Stands in for `@supabase/auth-js` (aliased in vite.config.ts). @neondatabase/auth's
 * Better Auth helpers import only these error classes from it, which otherwise pulls the
 * whole Supabase client (~230 KB source) onto the first screen. Same behaviour as
 * auth-js `lib/errors.js`. If an SDK update imports anything else, the build fails.
 */
export class AuthError extends Error {
    __isAuthError = true;
    constructor(message: string, public status?: number, public code?: string) {
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
