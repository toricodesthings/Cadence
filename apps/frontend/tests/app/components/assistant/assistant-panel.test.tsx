import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantSidePanel } from "../../../../app/components/assistant/AssistantSidePanel";
import { Tooltip } from "../../../../app/components/primitives";
import { useAssistantStore } from "../../../../app/stores/assistant-store";

const mocks = vi.hoisted(() => ({
    memory: { mode: "basic" as string | null },
    usage: { isSuccess: true, isError: false, error: null as unknown },
    shell: { isTouch: false, isCompact: false },
    conversation: {
        messages: [],
        status: "ready",
        isStreaming: false,
        threadTitle: null,
        activeConversationId: "conv-1",
        submitText: vi.fn(),
        handleNewChat: vi.fn(),
        handleSelectConversation: vi.fn(),
        handleStop: vi.fn(),
        handleEdit: vi.fn(),
        handleRetry: vi.fn(),
        regenerateLocal: vi.fn(),
        answerApproval: vi.fn(),
        replyToQuestion: vi.fn(),
        streamError: null,
        imageError: null,
        sendWithoutImages: vi.fn(),
        shareImages: vi.fn(),
    },
}));
vi.mock("../../../../app/hooks/ai/use-assistant-conversation", () => ({
    useAssistantConversation: () => mocks.conversation,
}));
vi.mock("../../../../app/hooks/ai/use-chat-attachments", () => ({
    useChatAttachments: () => ({
        attachments: [],
        readyImages: [],
        uploading: false,
        clearAttachments: vi.fn(),
        addImages: vi.fn(),
        removeAttachment: vi.fn(),
    }),
}));
vi.mock("../../../../app/hooks/ai/use-ai-usage", () => ({ useAiUsage: () => ({ data: undefined, ...mocks.usage }) }));
vi.mock("../../../../app/hooks/ai/use-memory", () => ({
    useMemoryPage: () => ({ data: mocks.memory }),
    useSetMemoryMode: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ session: null }) }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../../app/hooks/core/use-online-status", () => ({ useOnlineStatus: () => true }));
vi.mock("../../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => mocks.shell }));
vi.mock("../../../../app/hooks/ai/use-step-out-of-assistant", () => ({ useStepOutOfAssistant: () => vi.fn() }));
vi.mock("../../../../app/hooks/ui/use-utility-navigation", () => ({
    useUtilityNavigation: () => ({ openSettings: vi.fn() }),
}));
vi.mock("../../../../app/components/assistant/MemoryPicker", () => ({ MemoryPicker: () => null }));
vi.mock("../../../../app/components/assistant/ConversationList", () => ({ ConversationList: () => null }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.memory.mode = "basic";
    mocks.usage = { isSuccess: true, isError: false, error: null };
    mocks.shell = { isTouch: false, isCompact: false };
    mocks.conversation.submitText.mockReturnValue(true);
    useAssistantStore.setState({
        assistantPanelOpen: true,
        activeConversationId: "conv-1",
        historyOpen: false,
        memoryOpen: false,
        assistantFullscreen: false,
        pendingMessage: null,
    });
    Object.defineProperty(HTMLDivElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});

const panel = () => (
    <Tooltip.Provider>
        <AssistantSidePanel width={360} isMobile />
    </Tooltip.Provider>
);

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

    it("keeps the conversation usable while memory is unchosen: the card sits above it, nothing is inert", () => {
        mocks.memory.mode = null;
        const { container } = render(panel());
        expect(screen.getByRole("region", { name: "Memory" })).toBeTruthy();
        expect(container.querySelector("[inert]")).toBeNull();
        const box = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.change(box, { target: { value: "Plan my morning" } });
        expect(box.value).toBe("Plan my morning");
    });

    it("says Active now only when the signed-in usage read answers, and Offline or an error otherwise", () => {
        const { unmount } = render(panel());
        expect(screen.getByText("Active now")).toBeTruthy();
        unmount();
        mocks.usage = { isSuccess: false, isError: true, error: new TypeError("Failed to fetch") };
        const second = render(panel());
        expect(screen.getByText("Offline")).toBeTruthy();
        second.unmount();
        mocks.usage = { isSuccess: false, isError: true, error: { code: "UNAUTHORIZED" } };
        render(panel());
        expect(screen.getByText("Connection error")).toBeTruthy();
    });

    it("opens Conversations from the header, has no memory button, and offers full screen only on the touch sheet", () => {
        const { unmount } = render(panel());
        expect(screen.queryByRole("button", { name: "What Cadence knows" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
        expect(useAssistantStore.getState().historyOpen).toBe(true);
        unmount();
        mocks.shell = { isTouch: true, isCompact: true };
        render(panel());
        fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
        expect(useAssistantStore.getState().assistantFullscreen).toBe(true);
        expect(screen.getByRole("button", { name: "Exit full screen" })).toBeTruthy();
    });
});
