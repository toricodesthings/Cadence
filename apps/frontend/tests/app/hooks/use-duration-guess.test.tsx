import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../../app/lib/api/query-keys";
import { testQueryClient, withClient } from "../../helpers";

const mocks = vi.hoisted(() => ({
    mode: "full" as string,
    post: vi.fn(),
    settings: { data: undefined as unknown, write: vi.fn() },
}));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { ai: { memory: { duration: { $post: mocks.post } } } } }),
}));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ authReady: true, isAuthenticated: true }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: { assistant: { memoryMode: mocks.mode } } }),
    useSettingsCache: () => ({ read: () => ({ assistant: {} }), write: mocks.settings.write }),
}));
vi.mock("../../../app/lib/api/helpers", () => ({ unwrapResponse: async (r: unknown) => r }));

import { useDurationGuesser } from "../../../app/hooks/ai/use-duration-guess";
import { useDurationApi } from "../../../app/hooks/ai/use-memory";

const row = { taskId: "t0", title: "Lab report", projectId: null, series: false, lowMinutes: 45, highMinutes: 45, anchored: false, saidOn: "2026-10-10" };
const task = { id: "t1", title: "Lab report", projectId: null };

beforeEach(() => {
    mocks.mode = "full";
    vi.clearAllMocks();
});

describe("useDurationGuesser", () => {
    it("guesses nothing outside Full, even with evidence still cached", () => {
        const client = testQueryClient();
        client.setQueryData(queryKeys.ai.durationEvidence, Array.from({ length: 6 }, (_, i) => ({ ...row, taskId: `t${i}` })));
        const { result, rerender } = renderHook(() => useDurationGuesser(), { wrapper: withClient(client) });
        expect(result.current(task)).not.toBeNull();
        mocks.mode = "basic";
        rerender();
        expect(result.current(task)).toBeNull();
    });
});

describe("useDurationApi.report", () => {
    it("writes the stored answer where an open Took row reads it", async () => {
        const client = testQueryClient();
        const view = { taskId: "t1", completedAt: "2026-10-12T20:00:00.000Z", lowMinutes: 45, highMinutes: 45, anchored: false };
        mocks.post.mockResolvedValue(view);
        const { result } = renderHook(() => useDurationApi(), { wrapper: withClient(client) });
        await act(() => result.current.report({ taskId: "t1", completedAt: view.completedAt, value: { kind: "point", minutes: 45 }, anchored: false } as any));
        expect(client.getQueryData(queryKeys.ai.duration("t1", view.completedAt))).toEqual(view);
    });
});
