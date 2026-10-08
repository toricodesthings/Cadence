import { beforeEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ hasDesktopWindow: vi.fn(), getDesktopStore: vi.fn() }));
vi.mock("../../../app/platform/runtime", () => ({
    ...runtime,
    getWebStorage: () => window.localStorage,
}));
vi.mock("../../../app/platform/desktop-keyring", () => ({
    readDesktopSecureSecret: vi.fn(),
    writeDesktopSecureSecret: vi.fn(),
    clearDesktopSecureSecret: vi.fn(),
}));

const session = { jwt: "secret.jwt.token", data: { session: {}, user: { id: "u1" } }, persistedAt: 1 };

beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    runtime.getDesktopStore.mockResolvedValue(null);
});

it("inside the app, a missing native store never downgrades the sign-in to browser storage", async () => {
    runtime.hasDesktopWindow.mockReturnValue(true);
    const { writeDesktopAuthSession } = await import("../../../app/lib/desktop-auth-session");
    await expect(writeDesktopAuthSession(session)).rejects.toThrow();
    expect(window.localStorage.length).toBe(0);
});

it("the desktop build in a plain browser (dev) still keeps its session", async () => {
    runtime.hasDesktopWindow.mockReturnValue(false);
    const { writeDesktopAuthSession } = await import("../../../app/lib/desktop-auth-session");
    await writeDesktopAuthSession(session);
    expect(window.localStorage.length).toBe(1);
});
