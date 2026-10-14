import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantComposer } from "../../../../app/components/assistant/AssistantComposer";
import { Tooltip } from "../../../../app/components/primitives";
import { useAssistantStore } from "../../../../app/stores/assistant-store";

beforeEach(() => useAssistantStore.setState({ pendingMessage: null, approvalMode: "ask" }));

function setup(isTouch = false, accepted = true) {
    const onSend = vi.fn((_text: string) => accepted);
    const onCommand = vi.fn();
    function ControlledComposer() {
        const [input, setInput] = useState("");
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        return <Tooltip.Provider>
        <AssistantComposer assistantName="Cadence" isTouch={isTouch} isMobile={false}
            choosingMemory={false} isStreaming={false} online={true}
            input={input} onInputChange={setInput} inputNotice={null} setInputNotice={vi.fn()} usageNotice={null} perMessage={3}
            imageAllowance={{ left: 20, blocked: false, label: "Attach an image" }}
            images={{ attachments: [], readyImages: [], uploading: false,
                addImages: vi.fn(), removeAttachment: vi.fn(), clearAttachments: vi.fn() }}
            textareaRef={textareaRef} onSend={(text) => {
                const accepted = onSend(text);
                if (accepted) setInput("");
                return accepted;
            }}
            onStop={vi.fn()} onCommand={onCommand} />
        </Tooltip.Provider>;
    }
    render(<ControlledComposer />);
    const input = screen.getByLabelText<HTMLTextAreaElement>("Message Cadence");
    return { input, onSend, onCommand };
}

describe("assistant composer draft and commands", () => {
    it("keeps rejected drafts and clears accepted submissions", () => {
        const { input, onSend } = setup(false, false);
        fireEvent.change(input, { target: { value: "Keep this draft" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));
        expect(onSend).toHaveBeenCalledWith("Keep this draft");
        expect(input.value).toBe("Keep this draft");
        onSend.mockReturnValue(true);
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));
        expect(input.value).toBe("");
    });

    it("runs typed commands locally but sends unrecognized slash text", () => {
        const { input, onSend, onCommand } = setup();
        fireEvent.change(input, { target: { value: "/usage" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "usage" }));
        expect(onSend).not.toHaveBeenCalled();
        expect(input.value).toBe("");
        fireEvent.change(input, { target: { value: "/something-else" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onSend).toHaveBeenCalledWith("/something-else");
    });

    it("opens the command menu over an ordinary draft without consuming it", () => {
        const { input, onSend, onCommand } = setup();
        fireEvent.change(input, { target: { value: "My unfinished thought" } });
        fireEvent.click(screen.getByRole("button", { name: "Commands" }));
        fireEvent.keyDown(input, { key: "Tab" });
        expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ id: "usage" }));
        expect(input.value).toBe("My unfinished thought");
        expect(onSend).not.toHaveBeenCalled();
    });

    it("dismisses only the slash menu on Escape and restores it after editing", () => {
        const { input } = setup();
        fireEvent.change(input, { target: { value: "/" } });
        expect(input.getAttribute("aria-controls")).toBeTruthy();
        const parentEscape = vi.fn();
        window.addEventListener("keydown", parentEscape);
        fireEvent.keyDown(input, { key: "Escape" });
        expect(parentEscape).not.toHaveBeenCalled();
        window.removeEventListener("keydown", parentEscape);
        expect(input.getAttribute("aria-controls")).toBeNull();
        expect(input.value).toBe("/");
        fireEvent.change(input, { target: { value: "/h" } });
        expect(input.getAttribute("aria-controls")).toBeTruthy();
    });

    it("leaves touch Return for newlines and sends through the button", () => {
        const { input, onSend } = setup(true);
        fireEvent.change(input, { target: { value: "A thought" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onSend).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));
        expect(onSend).toHaveBeenCalledWith("A thought");
    });

    it("consumes an externally requested message into the draft exactly once", () => {
        useAssistantStore.setState({ pendingMessage: "Help plan tomorrow" });
        const { input } = setup();
        expect(input.value).toBe("Help plan tomorrow");
        expect(useAssistantStore.getState().pendingMessage).toBeNull();
    });
});
