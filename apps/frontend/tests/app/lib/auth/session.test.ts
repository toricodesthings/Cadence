import { afterEach, expect, it, vi } from "vitest";
import { readFreshSession } from "../../../../app/lib/auth/session";

const getSession = vi.hoisted(() => vi.fn().mockResolvedValue({ data: null }));
vi.mock("../../../../app/lib/auth-client", () => ({ authClient: { getSession } }));
afterEach(() => { history.replaceState(null, "", "/"); getSession.mockClear(); });

it("bypasses the SDK cache for an ordinary session recovery", async () => {
    await readFreshSession();
    expect(getSession).toHaveBeenCalledWith({ fetchOptions: { headers: { "X-Force-Fetch": "true" }, cache: "no-store" } });
});

it("keeps the SDK's one-time verifier exchange deduplicated", async () => {
    history.replaceState(null, "", "/auth/callback?neon_auth_session_verifier=one-time");
    await readFreshSession();
    expect(getSession).toHaveBeenCalledWith(undefined);
});
