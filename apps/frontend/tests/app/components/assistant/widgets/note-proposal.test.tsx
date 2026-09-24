import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteProposal, type NoteProposal } from "../../../../../app/components/assistant/widgets/note-proposal";
import { shouldAutoApply } from "../../../../../app/components/assistant/widgets/use-proposal-resolver";

const getNote = vi.fn();
const patchNote = vi.fn();

vi.mock("../../../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { tasks: { ":taskId": { note: { $get: getNote, $patch: patchNote } } } } }),
}));
vi.mock("../../../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ authReady: true, isAuthenticated: true }),
}));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const note = (body: string, version: number) => json(200, { data: { body, version, updatedAt: "2026-09-23T12:00:00.000Z" } });

function render(proposal: NoteProposal) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(() => useNoteProposal("task-1", proposal), {
        wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    });
}

describe("assistant note changes", () => {
    beforeEach(() => {
        getNote.mockReset();
        patchNote.mockReset();
    });

    it("writes a rewrite to the note the panel shows, with the version the model read", async () => {
        getNote.mockImplementation(async () => note("Buy milk\nCall Sam", 3));
        patchNote.mockResolvedValue(note("Buy oat milk\nCall Sam", 4));
        const { result } = render({ note: "Buy oat milk\nCall Sam", noteVersion: 3 });
        await waitFor(() => expect(result.current.current).toBe("Buy milk\nCall Sam"));

        expect(result.current.diff).toEqual([
            { text: "Buy milk", removed: true },
            { text: "Buy oat milk", removed: false },
        ]);
        // A rewrite that removes text waits for a tap in Auto; Full still applies it.
        expect(result.current.removesText).toBe(true);
        expect(shouldAutoApply("auto", result.current.removesText)).toBe(false);
        expect(shouldAutoApply("full", result.current.removesText)).toBe(true);

        await result.current.write();
        expect(patchNote).toHaveBeenCalledWith({ param: { taskId: "task-1" }, json: { body: "Buy oat milk\nCall Sam", expectedVersion: 3 } });
    });

    it("turns a stale version into a conflict the user can read, having written nothing else", async () => {
        getNote.mockImplementation(async () => note("Edited elsewhere", 5));
        patchNote.mockResolvedValue(json(409, { error: { code: "CONFLICT", message: "Note was modified by another client", status: 409 } }));
        const { result } = render({ note: "Mine", noteVersion: 4 });
        await waitFor(() => expect(result.current.current).toBe("Edited elsewhere"));

        await expect(result.current.write()).rejects.toThrow("Your note changed. Want me to look again?");
        expect(patchNote).toHaveBeenCalledTimes(1);
    });

    it("refuses to rewrite a note longer than the model can read, but adds to it", async () => {
        const long = "x".repeat(1_200);
        getNote.mockImplementation(async () => note(long, 2));
        patchNote.mockResolvedValue(note(`${long}\nOne more`, 3));

        const rewrite = render({ note: "short", noteVersion: 2 }).result;
        await waitFor(() => expect(rewrite.current.current).toBe(long));
        await expect(rewrite.current.write()).rejects.toThrow("too long for me to rewrite");
        expect(patchNote).not.toHaveBeenCalled();

        const append = render({ appendNote: "One more", noteVersion: 2 }).result;
        await waitFor(() => expect(append.current.current).toBe(long));
        expect(append.current.removesText).toBe(false);
        await append.current.write();
        expect(patchNote).toHaveBeenCalledWith({ param: { taskId: "task-1" }, json: { body: `${long}\nOne more`, expectedVersion: 2 } });
    });

    it("counts a rewrite as removing text while the current note is still loading", () => {
        getNote.mockImplementation(() => new Promise(() => {}));
        const { result } = render({ note: "anything", noteVersion: 0 });

        expect(result.current.removesText).toBe(true);
    });
});
