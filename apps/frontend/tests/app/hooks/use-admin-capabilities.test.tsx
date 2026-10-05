import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminCapabilities } from "../../../app/hooks/auth/use-admin-capabilities";
import { testQueryClient, withClient } from "../../helpers";

const state = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({ api: { debug: { capabilities: { $get: state.get } } } }) }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ authReady: true, isAuthenticated: true, session: { user: { id: "user" }, session: { token: "private-session-token" } } }) }));
beforeEach(() => { state.get.mockReset(); });

describe("developer capability reads", () => {
    it("uses account identity without retaining a private session token", async () => {
        state.get.mockResolvedValue(new Response(null, { status: 404 }));
        const qc = testQueryClient();
        const { result } = renderHook(useAdminCapabilities, { wrapper: withClient(qc) });
        await waitFor(() => expect(result.current.data?.canUseDeveloperTools).toBe(false));
        expect(JSON.stringify(qc.getQueryCache().getAll().map(q => q.queryKey))).not.toContain("private-session-token");
        qc.clear();
    });
    it("retains dev-deployment capabilities and the unavailable fallback", async () => {
        state.get.mockResolvedValue(Response.json({ data: { canUseDeveloperTools: true } }));
        const qc = testQueryClient();
        const view = renderHook(useAdminCapabilities, { wrapper: withClient(qc) });
        await waitFor(() => expect(view.result.current.data?.canUseDeveloperTools).toBe(true));
        expect(qc.getQueryCache().getAll()[0].meta?.persist).toBe(false);
        view.unmount();
        qc.clear();
        state.get.mockResolvedValue(new Response(null, { status: 404 }));
        const fallback = renderHook(useAdminCapabilities, { wrapper: withClient(qc) });
        await waitFor(() => expect(fallback.result.current.data?.canUseDeveloperTools).toBe(false));
        qc.clear();
    });
});
