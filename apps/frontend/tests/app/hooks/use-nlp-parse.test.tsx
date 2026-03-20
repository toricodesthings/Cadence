import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNlpParse } from "../../../app/hooks/use-nlp-parse";

const parseMock = vi.fn();

vi.mock("@cadence/nlp/parse", () => ({
    parse: (...args: unknown[]) => parseMock(...args),
}));

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}

describe("useNlpParse", () => {
    beforeEach(() => {
        parseMock.mockReset();
    });

    it("dismisses parsed entities by id and resolves projects from normalized values", async () => {
        parseMock.mockReturnValue({
            rawInput: "tomorrow with Alpha",
            cleanedTitle: "with Alpha",
            parserVersion: "2.0.0",
            sourceSurface: "inline_add",
            entities: [
                {
                    id: "due_date:tomorrow",
                    type: "due_date",
                    sourceText: "tomorrow",
                    start: 0,
                    end: 8,
                    confidence: "high",
                    normalizedValue: {
                        date: "2026-03-21",
                        datetime: null,
                        hasTime: false,
                        humanLabel: "Tomorrow",
                    },
                    explanation: "Detected date: Tomorrow",
                },
                {
                    id: "project:project-1",
                    type: "project",
                    sourceText: "Alpha",
                    start: 13,
                    end: 18,
                    confidence: "high",
                    normalizedValue: {
                        id: "project-1",
                        name: "Alpha",
                    },
                    explanation: "Project: Alpha",
                },
            ],
            warnings: [],
            summary: "Cadence understood: Tomorrow · Alpha",
        });

        const { result } = renderHook(
            () =>
                useNlpParse({
                    input: "tomorrow with Alpha",
                    projects: [{ id: "project-1", name: "Alpha" }],
                    tags: [],
                    dismissedEntityIds: ["due_date:tomorrow"],
                    sourceSurface: "inline_add",
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.projectId).toBe("project-1"));

        expect(result.current.dueDate).toBeNull();
        expect(result.current.tokens).toHaveLength(1);
        expect(result.current.tokens[0]?.id).toBe("project:project-1");
    });
});
