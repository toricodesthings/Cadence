import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoTagOfferDialog } from "../../../../app/components/tags/AutoTagOfferDialog";
import { useAutoTagOfferStore } from "../../../../app/stores/auto-tag-offer-store";
import { withClient, testQueryClient } from "../../../helpers";

const m = vi.hoisted(() => ({ post: vi.fn(), undo: vi.fn() }));
vi.mock("../../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { tags: { ":id": { tasks: { $post: m.post } } } } }),
}));
vi.mock("../../../../app/lib/api/helpers", () => ({ unwrapResponse: async (r: any) => r }));
vi.mock("../../../../app/lib/utils/undo-toast", () => ({ toastUndo: m.undo }));

const offer = { tagId: "t", tagName: "COMPUTER 2000", places: ["COMPUTER2000"], taskIds: ["a", "b"] };
const open = () => {
    render(<AutoTagOfferDialog />, { wrapper: withClient(testQueryClient()) });
    act(() => useAutoTagOfferStore.getState().show(offer));
};

beforeEach(() => {
    vi.clearAllMocks();
    m.post.mockImplementation(async ({ json }) => ({ taskIds: json.taskIds }));
});

describe("AutoTagOfferDialog", () => {
    it("names the count and the place, and Not now sends nothing", () => {
        open();
        expect(screen.getByText("Tag 2 tasks in COMPUTER2000?")).toBeTruthy();
        fireEvent.click(screen.getByText("Not now"));
        expect(m.post).not.toHaveBeenCalled();
        expect(useAutoTagOfferStore.getState().offer).toBeNull();
    });
    it("confirm tags the tasks, and Undo untags exactly the ones it added", async () => {
        m.post.mockResolvedValueOnce({ taskIds: ["b"] });
        open();
        fireEvent.click(screen.getByText("Tag 2 tasks"));
        await waitFor(() => expect(m.undo).toHaveBeenCalled());
        expect(m.post).toHaveBeenCalledWith({ param: { id: "t" }, json: { taskIds: ["a", "b"], linked: true } });
        expect(m.undo.mock.calls[0][0]).toBe("Tagged 1 task");
        m.undo.mock.calls[0][1]();
        await waitFor(() =>
            expect(m.post).toHaveBeenLastCalledWith({ param: { id: "t" }, json: { taskIds: ["b"], linked: false } }),
        );
    });
});
