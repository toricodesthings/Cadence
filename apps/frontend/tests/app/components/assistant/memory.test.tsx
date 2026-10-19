import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({
    page: { mode: null as string | null, choiceAt: null, inactive: false, catchUp: null as object | null, facts: [] as unknown[], nextCursor: null as string | null, forgotten: [] as unknown[] },
    older: vi.fn(),
    toast: vi.fn(),
    setMode: vi.fn(),
    forget: vi.fn(),
    restore: vi.fn(),
}));

vi.mock("../../../../app/hooks/ai/use-memory", () => ({
    useMemoryPage: () => ({ data: memory.page, isLoading: false, isFetching: false }),
    useSetMemoryMode: () => ({ mutate: memory.setMode, isPending: false }),
    useForgetMemory: () => ({ mutate: memory.forget, mutateAsync: async (input: unknown) => memory.forget(input), isPending: false }),
    useRestoreMemory: () => ({ mutate: memory.restore, isPending: false }),
    useClearMemory: () => ({ mutate: vi.fn(), isPending: false }),
    useOlderMemory: () => ({ mutate: memory.older, isPending: false }),
}));
vi.mock("../../../../app/lib/utils/undo-toast", async (original) => ({
    ...(await original<typeof import("../../../../app/lib/utils/undo-toast")>()),
    toastUndo: (...args: unknown[]) => memory.toast(...args),
}));

vi.mock("@tanstack/react-query", async (original) => ({
    ...(await original<typeof import("@tanstack/react-query")>()),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { Tooltip } from "../../../../app/components/primitives";
import { MemoryCard } from "../../../../app/components/assistant/MemoryCard";
import { MemoryOverlay } from "../../../../app/components/assistant/MemoryOverlay";
import { RememberReceipt } from "../../../../app/components/assistant/widgets/RememberReceipt";

beforeEach(() => {
    vi.clearAllMocks();
    memory.page = { mode: null, choiceAt: null, inactive: false, catchUp: null, facts: [], nextCursor: null, forgotten: [] };
    localStorage.clear();
});

describe("MemoryCard", () => {
    it("is a labelled region, not a dialog, so the message box keeps working underneath", () => {
        render(<MemoryCard />);
        expect(screen.getByRole("region", { name: "Memory" })).toBeTruthy();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByText(/I remember what you tell me/)).toBeTruthy();
        expect(screen.getByText(/when you like to do things/)).toBeTruthy();
        expect(screen.getByText(/Settings → Assistant → Memory/)).toBeTruthy();
    });

    it("Switch to Full, Keep Basic and Turn off each post their mode, with no toast (the card names Settings instead)", () => {
        render(<MemoryCard />);
        fireEvent.click(screen.getByRole("button", { name: "Switch to Full" }));
        expect(memory.setMode).toHaveBeenLastCalledWith("full");
        fireEvent.click(screen.getByRole("button", { name: "Keep Basic" }));
        expect(memory.setMode).toHaveBeenLastCalledWith("basic");
        fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
        expect(memory.setMode).toHaveBeenLastCalledWith("off");
        expect(memory.toast).not.toHaveBeenCalled();
    });

    it("stays out of the way once chosen", () => {
        memory.page.mode = "basic";
        const { container } = render(<MemoryCard />);
        expect(container.innerHTML).toBe("");
    });

    it("says nothing to Full people", () => {
        memory.page = { ...memory.page, mode: "full" };
        expect(render(<MemoryCard />).container.innerHTML).toBe("");
    });
});

const renderOverlay = (props: { onClose?: () => void; onAsk?: (text: string) => void }) =>
    render(
        <Tooltip.Provider>
            <MemoryOverlay onClose={props.onClose ?? (() => {})} onAsk={props.onAsk ?? (() => {})} />
        </Tooltip.Provider>,
    );

describe("MemoryOverlay", () => {
    const fact = (over: object = {}) => ({
        id: "f1", kind: "life", content: "Sister Maya’s wedding is 2027-06-14", saidOn: "2026-08-12", lastSeenOn: "2026-08-12",
        seenCount: 1, validThrough: null, source: "chat", confidence: "stated", sensitive: false, pinned: false, conversationId: null, ...over,
    });

    it("says where an item came from and forgets it in one tap", () => {
        memory.page = { ...memory.page, mode: "basic", inactive: false, facts: [fact()] };
        renderOverlay({});

        expect(screen.getByText("About you")).toBeTruthy();
        expect(screen.getByText(/since Aug 2026 · from our chat/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Sister Maya/ }));
        fireEvent.click(screen.getByRole("button", { name: "Forget" }));
        expect(memory.forget).toHaveBeenCalledWith({ id: "f1" });
    });

    it("routes every other change through the chat box", () => {
        memory.page = { ...memory.page, mode: "basic", inactive: false };
        const onAsk = vi.fn();
        renderOverlay({ onAsk });

        expect(screen.getByText(/Nothing yet\. Just talk to me/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Tell me what to change"), { target: { value: "I work afternoons now" } });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        expect(onAsk).toHaveBeenCalledWith("I work afternoons now");
    });

    it("keeps stored items visible but marked unused while memory is off", () => {
        memory.page = { ...memory.page, mode: "off", inactive: true, facts: [fact()] };
        renderOverlay({});
        expect(screen.getByText(/Memory is off, so none of this is used/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
        expect(memory.setMode).toHaveBeenCalledWith("basic");
    });

    it("shows Full's catch-up as a rough bar while it reads, then what it learned", () => {
        memory.page = { ...memory.page, mode: "full", inactive: false, catchUp: { progress: 0.45, learned: 3, doneAt: null } };
        const { unmount } = renderOverlay({});
        expect(screen.getByRole("progressbar", { name: "Reading your last 3 months" }).getAttribute("aria-valuenow")).toBe("45");
        expect(screen.getByText(/3 things so far/)).toBeTruthy();
        unmount();

        memory.page = { ...memory.page, catchUp: { progress: 1, learned: 1, doneAt: "2026-10-12T07:30:00.000Z" } };
        renderOverlay({});
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(screen.getByText("Done: I read your last 3 months and learned 1 thing.")).toBeTruthy();
    });

    it("says Basic (default) while nothing has been chosen", () => {
        memory.page = { ...memory.page, mode: null };
        const { unmount } = renderOverlay({});
        expect(screen.getByRole("radio", { name: "Basic (default)" }).getAttribute("aria-checked")).toBe("true");
        unmount();
    });

    it("pages: Show older loads the next 30 and appends them", () => {
        memory.page = { ...memory.page, mode: "basic", facts: [fact()], nextCursor: "c1" };
        memory.older.mockImplementation((cursor: string, options?: { onSuccess?: (page: unknown) => void }) =>
            options?.onSuccess?.({ facts: [fact({ id: "f2", content: "An older thing" })], nextCursor: null, cursor }));
        renderOverlay({});
        fireEvent.click(screen.getByRole("button", { name: "Show older" }));
        expect(memory.older).toHaveBeenCalledWith("c1", expect.anything());
        expect(screen.getByText("An older thing")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
    });

    it("shows a fact once when an older page repeats the first page's edge (after a Forget shifted it)", () => {
        memory.page = { ...memory.page, mode: "basic", facts: [fact(), fact({ id: "f2", content: "An older thing" })], nextCursor: "c1" };
        memory.older.mockImplementation((_cursor: string, options?: { onSuccess?: (page: unknown) => void }) =>
            options?.onSuccess?.({ facts: [fact({ id: "f2", content: "An older thing" }), fact({ id: "f3", content: "Oldest thing" })], nextCursor: null }));
        renderOverlay({});
        fireEvent.click(screen.getByRole("button", { name: "Show older" }));
        expect(screen.getAllByText("An older thing")).toHaveLength(1);
        expect(screen.getByText("Oldest thing")).toBeTruthy();
    });

    it("only offers search once there is a lot to search", () => {
        memory.page = { ...memory.page, mode: "basic", inactive: false, facts: Array.from({ length: 31 }, (_, i) => fact({ id: `f${i}`, content: `item ${i}` })) };
        renderOverlay({});
        expect(screen.getByLabelText("Search what I know")).toBeTruthy();
    });
});

describe("RememberReceipt", () => {
    const part = (output: object, state = "output-available") => ({ state, input: {}, output });

    it("shows what was remembered and takes a save back with no trace", () => {
        memory.page.facts = [{ id: "f1" }];
        render(<RememberReceipt ctx={{ part: part({ ok: true, action: "saved", id: "f1", text: "Friday evenings stay free" }), toolName: "remember" } as never} />);
        expect(screen.getByRole("status").textContent).toContain("Remembered: Friday evenings stay free");
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(memory.forget).toHaveBeenCalledWith({ id: "f1", undo: true });
        expect(screen.getByRole("status").textContent).toContain("Not saved");
    });

    it("says a save that is gone (undone after a reload, or forgotten since) is no longer remembered, with no Undo", () => {
        render(<RememberReceipt ctx={{ part: part({ ok: true, action: "saved", id: "f1", text: "Works afternoons" }), toolName: "remember" } as never} />);
        expect(screen.getByRole("status").textContent).toContain("No longer remembered: Works afternoons");
        expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("says a repeat was already known and offers no Undo, which would delete the older fact", () => {
        memory.page.facts = [{ id: "f1" }];
        render(<RememberReceipt ctx={{ part: part({ ok: true, action: "kept", id: "f1", text: "Friday evenings stay free" }), toolName: "remember" } as never} />);
        expect(screen.getByRole("status").textContent).toContain("Already remembered: Friday evenings stay free");
        expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("brings a forgotten item back on Undo, and offers no Undo on an old reply", () => {
        const { rerender } = render(<RememberReceipt ctx={{ part: part({ ok: true, action: "forgot", id: "f2", text: "Bus pass" }), toolName: "remember" } as never} />);
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(memory.restore).toHaveBeenCalledWith("f2");

        rerender(<RememberReceipt ctx={{ part: part({ ok: true, action: "forgot", id: "f3", text: "x" }), toolName: "remember", stale: true } as never} />);
        expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("renders nothing for a failed or still-running call", () => {
        const failed = render(<RememberReceipt ctx={{ part: part({ ok: false, error: "off" }), toolName: "remember" } as never} />);
        expect(failed.container.innerHTML).toBe("");
        const running = render(<RememberReceipt ctx={{ part: { state: "input-available", input: {} }, toolName: "remember" } as never} />);
        expect(running.container.innerHTML).toBe("");
    });
});
