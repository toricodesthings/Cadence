import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useDidYouMean } from "../../../app/hooks/search/use-did-you-mean";

const state = vi.hoisted(() => ({
    settings: undefined as unknown,
    post: vi.fn(),
}));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: state.settings }) }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ authReady: true, isAuthenticated: true }) }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({ api: { search: { "did-you-mean": { $post: state.post } } } }) }));

const task = { id: "t1", title: "clean out the fridge" };
const on = (smartPlacement: boolean) => ({ tasks: { intelligence: { smartPlacement } } });
const client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
    client.clear();
    vi.clearAllMocks();
    state.post.mockResolvedValue(new Response(JSON.stringify({ data: { task } }), { headers: { "content-type": "application/json" } }));
});

it("asks only once settings have loaded with the switch on, and hides a cached answer once it's off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    state.settings = undefined;
    const { result, rerender } = renderHook(() => useDidYouMean("refrigerator"), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(state.post).not.toHaveBeenCalled();

    state.settings = on(true);
    rerender();
    await waitFor(() => expect(result.current).toEqual(task));
    expect(state.post).toHaveBeenCalledTimes(1);

    state.settings = on(false);
    rerender();
    expect(result.current).toBeNull();
    expect(state.post).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
});
