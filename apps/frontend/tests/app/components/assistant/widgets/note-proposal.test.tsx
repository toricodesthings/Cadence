import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteProposal, type NoteProposal } from "../../../../../app/components/assistant/widgets/note-proposal";
import { withClient } from "../../../../helpers";

const getNote = vi.fn();

vi.mock("../../../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { tasks: { ":taskId": { note: { $get: getNote } } } } }),
}));
vi.mock("../../../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ authReady: true, isAuthenticated: true }),
}));

const note = (body: string, version: number) => Response.json({ data: { body, version, updatedAt: "2026-09-23T12:00:00.000Z" } });
const render = (proposal: NoteProposal) => renderHook(() => useNoteProposal("task-1", proposal), { wrapper: withClient() });

describe("assistant note changes", () => {
    beforeEach(() => getNote.mockReset());

    it("diffs a rewrite against the note the panel shows", async () => {
        getNote.mockImplementation(async () => note("Buy milk\nCall Sam", 3));
        const { result } = render({ note: "Buy oat milk\nCall Sam", noteVersion: 3 });
        await waitFor(() => expect(result.current.current).toBe("Buy milk\nCall Sam"));

        expect(result.current.diff).toEqual([
            { text: "Buy milk", removed: true },
            { text: "Buy oat milk", removed: false },
        ]);
    });

    it("shows an addition as new lines only", async () => {
        getNote.mockImplementation(async () => note("Buy milk", 2));
        const { result } = render({ appendNote: "Call Sam", noteVersion: 2 });
        await waitFor(() => expect(result.current.current).toBe("Buy milk"));

        expect(result.current.next).toBe("Buy milk\nCall Sam");
        expect(result.current.diff).toEqual([{ text: "Call Sam", removed: false }]);
    });
});
