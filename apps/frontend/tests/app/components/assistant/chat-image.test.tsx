import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageViewer, formatBytes, type ViewerImage } from "../../../../app/components/shared/ImageViewer";
import { queryKeys } from "../../../../app/lib/api/query-keys";
import { testQueryClient, withClient } from "../../../helpers";

vi.mock("../../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));

import { ChatImages } from "../../../../app/components/assistant/ChatImage";

URL.createObjectURL = () => "blob:x";
URL.revokeObjectURL = () => undefined;

describe("ImageViewer", () => {
    it("shows the title and size, steps through the set with wraparound, and closes", () => {
        const images: ViewerImage[] = [
            { key: "a", title: "whiteboard.jpg", src: "blob:a", bytes: 412_000 },
            { key: "b", title: "syllabus.png", src: "blob:b", bytes: 1_300_000 },
        ];
        let index: number | null = 0;
        const onIndexChange = (next: number | null) => {
            index = next;
            view.rerender(<ImageViewer images={images} index={index} onIndexChange={onIndexChange} />);
        };
        const view = render(<ImageViewer images={images} index={index} onIndexChange={onIndexChange} />);

        expect(screen.getByText("whiteboard.jpg")).toBeTruthy();
        expect(screen.getByText("412 KB")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Next image" }));
        expect(screen.getByText("syllabus.png")).toBeTruthy();
        expect(screen.getByText("1.3 MB")).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
        expect(index).toBe(0);

        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("formats sizes", () => {
        expect(formatBytes(200)).toBe("1 KB");
        expect(formatBytes(999_000)).toBe("999 KB");
        expect(formatBytes(2_450_000)).toBe("2.5 MB");
    });
});

describe("ChatImages", () => {
    it("opens a sent photo in the viewer", async () => {
        const id = "33333333-3333-4333-8333-333333333333";
        const queryClient = testQueryClient();
        queryClient.setQueryData(queryKeys.ai.image(id), new Blob(["x"], { type: "image/webp" }));
        render(<ChatImages ids={[id]} />, { wrapper: withClient(queryClient) });

        fireEvent.click(await screen.findByRole("button", { name: "View image full size" }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog.querySelector("img")?.getAttribute("src")).toBe("blob:x");
        expect(screen.getByText("Photo you sent")).toBeTruthy();
    });
});
