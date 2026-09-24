import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftDetails, DraftQuotes, type TaskDraft } from "../../../../../app/components/assistant/widgets/TaskBatchCard";
import { queryKeys } from "../../../../../app/lib/api/query-keys";

const LIST = "11111111-1111-4111-8111-111111111111";
const TAG = "22222222-2222-4222-8222-222222222222";
const SECTION = "33333333-3333-4333-8333-333333333333";

vi.mock("../../../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ authReady: true, isAuthenticated: true }) }));
const { getSections } = vi.hoisted(() => ({ getSections: vi.fn() }));
vi.mock("../../../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: {
        projects: { $get: async () => Response.json({ data: [{ id: "11111111-1111-4111-8111-111111111111", name: "Perfume" }] }) },
        sections: { $get: getSections },
    } }),
}));

function renderDraft(draft: TaskDraft) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.projects.all, [{ id: LIST, name: "Perfume" }]);
    queryClient.setQueryData(queryKeys.tags.all, [{ id: TAG, name: "Errands", color: "#e8a44a" }]);
    return render(
        <QueryClientProvider client={queryClient}>
            <DraftDetails draft={draft} />
            <DraftQuotes draft={draft} />
        </QueryClientProvider>,
    );
}

describe("assistant task draft", () => {
    it("shows every field it sets, by name, and gathers the photo's words in one place", () => {
        renderDraft({
            title: "Rabica checklist",
            scheduledStart: "2026-09-28T09:00:00-04:00",
            scheduledEnd: "2026-09-28T10:30:00-04:00",
            priority: 3,
            effort: 2,
            recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
            fixed: true,
            projectId: LIST,
            tagIds: [TAG],
            note: "Amouage",
            fromImage: { title: "Rabica checklist", note: "Amouage" },
        });

        expect(screen.getByText(/ – /)).toBeTruthy(); // start – end
        expect(screen.getByText(/priority$/)).toBeTruthy();
        expect(screen.getByText(/effort$/)).toBeTruthy();
        expect(screen.getByText(/^Repeats/)).toBeTruthy();
        expect(screen.getByText("Fixed")).toBeTruthy();
        expect(screen.getByText("Perfume")).toBeTruthy();
        expect(screen.getByLabelText("Tag Errands")).toBeTruthy();
        expect(screen.getAllByText(/^From your image/)).toHaveLength(1);
        expect(screen.getByText("Title: “Rabica checklist”")).toBeTruthy();
        expect(screen.getByText("Note: “Amouage”")).toBeTruthy();
    });

    it("shows nothing for a bare title", () => {
        const { container } = renderDraft({ title: "Call Sam" });
        expect(container.textContent).toBe("");
    });

    it("loads a section name even when that list's sections have never been opened", async () => {
        getSections.mockResolvedValueOnce(Response.json({ data: [{ id: SECTION, projectId: LIST, name: "COMP2000" }] }));
        renderDraft({ title: "Assignment", dueDate: "2026-10-22", projectId: LIST, sectionId: SECTION });
        expect(await screen.findByText("COMP2000")).toBeTruthy();
        expect(getSections).toHaveBeenCalledWith({ query: { projectId: LIST } });
        expect(screen.getByText("Perfume")).toBeTruthy();
    });
});
