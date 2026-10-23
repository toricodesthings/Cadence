/** Test stand-in for the Workers runtime module (`cloudflare:workers`). */
export class WorkerEntrypoint {}

const span = { setAttribute(_key: string, _value: number) { return this; } };
export const tracing = {
    enterSpan<T>(_name: string, callback: (value: typeof span) => T): T {
        return callback(span);
    },
};

/** Durable Object base: tests pass their own `ctx` (storage + alarm fakes) and env. */
export class DurableObject<E = unknown> {
    constructor(protected ctx: any, protected env: E) {}
}
