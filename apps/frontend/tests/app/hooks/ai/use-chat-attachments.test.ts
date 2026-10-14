import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatAttachments } from "../../../../app/hooks/ai/use-chat-attachments";

const mocks = vi.hoisted(() => ({
    upload: vi.fn(), discard: vi.fn(), compress: vi.fn(), cache: vi.fn(),
}));
vi.mock("../../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { ai: { images: { $post: mocks.upload, ":id": { $delete: mocks.discard } } } } }),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ setQueryData: mocks.cache }) }));
vi.mock("../../../../app/lib/utils/image", () => ({ compressChatImage: mocks.compress }));
vi.mock("../../../../app/lib/api/helpers", () => ({ unwrapResponse: async (data: unknown) => data }));

const file = () => new File(["image"], "photo.png", { type: "image/png" });
const uploaded = { id: "image-1", reused: false, images: { used: 1 } };

function setup(perMessage = 3) {
    const onNotice = vi.fn();
    const hook = renderHook(() => useChatAttachments({
        conversationId: "conv-1", imageAllowance: { left: 10, blocked: false, label: "Attach an image" },
        perMessage, onNotice,
    }));
    return { ...hook, onNotice };
}

beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    mocks.compress.mockResolvedValue(new Blob(["webp"], { type: "image/webp" }));
    mocks.upload.mockResolvedValue(uploaded);
    mocks.discard.mockResolvedValue(undefined);
});

describe("chat attachment ownership", () => {
    it("uploads compressed bytes and releases the preview on send without discarding the image", async () => {
        const { result } = setup();
        act(() => result.current.addImages([file()]));
        expect(result.current.uploading).toBe(true);
        await waitFor(() => expect(result.current.readyImages).toHaveLength(1));
        expect(mocks.upload).toHaveBeenCalledWith({ form: { file: expect.any(Blob), conversationId: "conv-1" } });
        expect(result.current.readyImages[0].blob.type).toBe("image/webp");
        act(() => result.current.clearAttachments(false));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
        expect(mocks.discard).not.toHaveBeenCalled();
        expect(result.current.attachments).toHaveLength(0);
    });

    it("discards a newly uploaded image if its attachment was removed during upload", async () => {
        let finish!: (data: typeof uploaded) => void;
        mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
        const { result } = setup();
        act(() => result.current.addImages([file()]));
        await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
        act(() => result.current.removeAttachment(result.current.attachments[0].id));
        await act(async () => finish(uploaded));
        expect(mocks.discard).toHaveBeenCalledWith({ param: { id: "image-1" } });
        expect(result.current.attachments).toHaveLength(0);
    });

    it("does not delete reused server images when a pending attachment is removed", async () => {
        let finish!: (data: typeof uploaded) => void;
        mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
        const { result } = setup();
        act(() => result.current.addImages([file()]));
        await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
        act(() => result.current.clearAttachments(true));
        await act(async () => finish({ ...uploaded, reused: true }));
        expect(mocks.discard).not.toHaveBeenCalled();
    });

    it("keeps one copy of a duplicate and discards it when abandoning the draft", async () => {
        const { result, onNotice } = setup();
        act(() => result.current.addImages([file()]));
        await waitFor(() => expect(result.current.readyImages).toHaveLength(1));
        act(() => result.current.addImages([file()]));
        await waitFor(() => expect(onNotice).toHaveBeenCalledWith("That image is already attached."));
        expect(result.current.attachments).toHaveLength(1);
        expect(mocks.discard).not.toHaveBeenCalled();
        act(() => result.current.clearAttachments(true));
        expect(mocks.discard).toHaveBeenCalledTimes(1);
    });

    it("enforces the per-message cap and keeps failed previews available for removal", async () => {
        mocks.compress.mockRejectedValueOnce(new Error("Couldn’t compress the image"));
        const { result, onNotice, unmount } = setup(1);
        act(() => result.current.addImages([file(), file()]));
        expect(onNotice).toHaveBeenCalledWith("Up to 1 images per message.");
        await waitFor(() => expect(result.current.attachments[0].status).toBe("failed"));
        expect(result.current.readyImages).toHaveLength(0);
        expect(onNotice).toHaveBeenCalledWith("Couldn’t compress the image");
        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    });
});
