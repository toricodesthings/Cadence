import type { ErrorCode } from "@cadence/contracts/common";

export class DomainError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly status = 400,
    ) {
        super(message);
        this.name = "DomainError";
    }
}
