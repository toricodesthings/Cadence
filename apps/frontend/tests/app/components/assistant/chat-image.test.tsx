import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../../../app/lib/api/query-keys";

vi.mock("../../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));

import { ChatImage } from "../../../../app/components/assistant/ChatImage";

describe("ChatImage", () => {
    it("opens the sent photo full size and closes again", async () => {
        URL.createObjectURL = () => "blob:x";
        URL.revokeObjectURL = () => undefined;
        const id = "33333333-3333-4333-8333-333333333333";
        const queryClient = new QueryClient();
        queryClient.setQueryData(queryKeys.ai.image(id), new Blob(["x"], { type: "image/webp" }));
        render(
            <QueryClientProvider client={queryClient}>
                <ChatImage id={id} />
            </QueryClientProvider>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "View image full size" }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog.querySelector("img")?.getAttribute("src")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
