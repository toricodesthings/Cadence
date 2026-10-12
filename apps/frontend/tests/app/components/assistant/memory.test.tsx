import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({
    page: { mode: null as string | null, choiceAt: null, inactive: true, facts: [] as unknown[], forgotten: [] as unknown[] },
    setMode: vi.fn(),
    forget: vi.fn(),
    restore: vi.fn(),
}));

vi.mock("../../../../app/hooks/ai/use-memory", () => ({
    useMemoryPage: () => ({ data: memory.page, isLoading: false }),
    useSetMemoryMode: () => ({ mutate: memory.setMode, isPending: false }),
    useForgetMemory: () => ({ mutate: memory.forget, mutateAsync: async (input: unknown) => memory.forget(input), isPending: false }),
    useRestoreMemory: () => ({ mutate: memory.restore, isPending: false }),
    useClearMemory: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { Tooltip } from "../../../../app/components/primitives";
import { MemoryPicker } from "../../../../app/components/assistant/MemoryPicker";
import { MemoryOverlay } from "../../../../app/components/assistant/MemoryOverlay";
import { RememberReceipt } from "../../../../app/components/assistant/widgets/RememberReceipt";

beforeEach(() => {
    vi.clearAllMocks();
    memory.page = { mode: null, choiceAt: null, inactive: true, facts: [], forgotten: [] };
});

describe("MemoryPicker", () => {
    it("preselects Basic so one tap on Continue is the whole job", () => {
        render(<MemoryPicker />);
        expect(screen.getByRole("radio", { name: /Basic/ }).getAttribute("aria-checked")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(memory.setMode).toHaveBeenCalledWith("basic");
    });

    it("takes Full when picked, and Off is a quiet link rather than a card", () => {
        render(<MemoryPicker />);
        fireEvent.click(screen.getByRole("radio", { name: /Full/ }));
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(memory.setMode).toHaveBeenLastCalledWith("full");

        expect(screen.getAllByRole("radio")).toHaveLength(2);
        fireEvent.click(screen.getByRole("button", { name: "Don’t remember anything" }));
        expect(memory.setMode).toHaveBeenLastCalledWith("off");
    });

    it("stays out of the way once chosen", () => {
        memory.page.mode = "basic";
        const { container } = render(<MemoryPicker />);
        expect(container.innerHTML).toBe("");
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

    it("only offers search once there is a lot to search", () => {
        memory.page = { ...memory.page, mode: "basic", inactive: false, facts: Array.from({ length: 31 }, (_, i) => fact({ id: `f${i}`, content: `item ${i}` })) };
        renderOverlay({});
        expect(screen.getByLabelText("Search what I know")).toBeTruthy();
    });
});

describe("RememberReceipt", () => {
    const part = (output: object, state = "output-available") => ({ state, input: {}, output });

    it("shows what was remembered and takes a save back with no trace", () => {
        render(<RememberReceipt ctx={{ part: part({ ok: true, action: "saved", id: "f1", text: "Friday evenings stay free" }), toolName: "remember" } as never} />);
        expect(screen.getByRole("status").textContent).toContain("Remembered: Friday evenings stay free");
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(memory.forget).toHaveBeenCalledWith({ id: "f1", undo: true });
        expect(screen.getByRole("status").textContent).toContain("Not saved");
    });

    it("says a repeat was already known and offers no Undo, which would delete the older fact", () => {
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
