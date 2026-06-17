/** Neutral, transport-agnostic domain error. Apps map to their own error type. */
export class DomainError extends Error {
    constructor(
        public readonly code: string,          // e.g. "INVALID_TASK_SCHEDULE"
        message: string,
        public readonly status: number = 400,  // HTTP-ish hint; apps may ignore
    ) {
        super(message);
        this.name = "DomainError";
    }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
