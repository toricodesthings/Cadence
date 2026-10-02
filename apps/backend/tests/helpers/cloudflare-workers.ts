/** Test stand-in for the Workers runtime module (`cloudflare:workers`). */
export class WorkerEntrypoint {}

const span = { setAttribute(_key: string, _value: number) { return this; } };
export const tracing = {
    enterSpan<T>(_name: string, callback: (value: typeof span) => T): T {
        return callback(span);
    },
};
