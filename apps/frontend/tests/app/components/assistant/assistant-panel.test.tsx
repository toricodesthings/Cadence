import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantSidePanel } from "../../../../app/components/assistant/AssistantSidePanel";
import { Tooltip } from "../../../../app/components/primitives";
import { useAssistantStore } from "../../../../app/stores/assistant-store";

const mocks = vi.hoisted(() => ({
    memory: { mode: "basic" as string | null },
    conversation: {
        messages: [], status: "ready", isStreaming: false, threadTitle: null, activeConversationId: "conv-1",
        submitText: vi.fn(), handleNewChat: vi.fn(), handleSelectConversation: vi.fn(), handleStop: vi.fn(),
        handleEdit: vi.fn(), handleRetry: vi.fn(), regenerateLocal: vi.fn(), answerApproval: vi.fn(), replyToQuestion: vi.fn(),
        streamError: null, imageError: null, sendWithoutImages: vi.fn(), shareImages: vi.fn(),
    },
}));
vi.mock("../../../../app/hooks/ai/use-assistant-conversation", () => ({ useAssistantConversation: () => mocks.conversation }));
vi.mock("../../../../app/hooks/ai/use-chat-attachments", () => ({ useChatAttachments: () => ({
    attachments: [], readyImages: [], uploading: false, clearAttachments: vi.fn(), addImages: vi.fn(), removeAttachment: vi.fn(),
}) }));
vi.mock("../../../../app/hooks/ai/use-ai-usage", () => ({ useAiUsage: () => ({ data: undefined }) }));
vi.mock("../../../../app/hooks/ai/use-memory", () => ({ useMemoryPage: () => ({ data: mocks.memory }) }));
vi.mock("../../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ session: null }) }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../../app/hooks/core/use-online-status", () => ({ useOnlineStatus: () => true }));
vi.mock("../../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isTouch: false }) }));
vi.mock("../../../../app/hooks/ai/use-step-out-of-assistant", () => ({ useStepOutOfAssistant: () => vi.fn() }));
vi.mock("../../../../app/hooks/ui/use-utility-navigation", () => ({ useUtilityNavigation: () => ({ openSettings: vi.fn() }) }));
vi.mock("../../../../app/components/assistant/MemoryPicker", () => ({ MemoryPicker: () => null }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.memory.mode = "basic";
    mocks.conversation.submitText.mockReturnValue(true);
    useAssistantStore.setState({ assistantPanelOpen: true, activeConversationId: "conv-1",
        historyOpen: false, memoryOpen: false, pendingMessage: null });
    Object.defineProperty(HTMLDivElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});

const panel = () => <Tooltip.Provider><AssistantSidePanel width={360} isMobile /></Tooltip.Provider>;

describe("assistant panel composition", () => {
    it("clears the shared draft after either a starter or composer send, retaining rejected drafts", () => {
        render(panel());
        const input = screen.getByRole<HTMLTextAreaElement>("textbox");
        fireEvent.change(input, { target: { value: "An unfinished thought" } });
        mocks.conversation.submitText.mockReturnValue(false);
        fireEvent.click(screen.getByRole("button", { name: "Plan my morning" }));
        expect(input.value).toBe("An unfinished thought");
        mocks.conversation.submitText.mockReturnValue(true);
        fireEvent.click(screen.getByRole("button", { name: "Plan my morning" }));
        expect(mocks.conversation.submitText).toHaveBeenLastCalledWith("Plan my morning", [], false);
        expect(input.value).toBe("");
        fireEvent.change(input, { target: { value: "Send this draft" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));
        expect(mocks.conversation.submitText).toHaveBeenLastCalledWith("Send this draft", [], false);
        expect(input.value).toBe("");
    });

    it("makes the conversation inert during memory choice and focuses the composer after answering", () => {
        mocks.memory.mode = null;
        const { container, rerender } = render(panel());
        expect(container.querySelector("header")?.hasAttribute("inert")).toBe(true);
        expect(container.querySelector("form")?.hasAttribute("inert")).toBe(true);
        expect(container.querySelector("form")?.previousElementSibling?.hasAttribute("inert")).toBe(true);
        mocks.memory.mode = "basic";
        rerender(panel());
        expect(container.querySelector("header")?.hasAttribute("inert")).toBe(false);
        expect(document.activeElement).toBe(screen.getByRole("textbox"));
    });
});
