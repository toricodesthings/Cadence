// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollabNoteHandle, collabColorFor } from "~/lib/notes/collab-session";
import { CollabNoteStatus } from "~/components/tasks/note/NoteStatus";

vi.mock("~/lib/api/client", () => ({
    getAuthJwt: vi.fn().mockResolvedValue(null),
    dropAuthJwt: vi.fn(),
}));

vi.mock("~/components/sharing/PersonAvatar", () => ({
    PersonAvatar: ({ userId }: { userId: string }) => <i data-testid="face" data-user={userId} />,
}));

describe("collaborative notes UI helpers", () => {
    it("assigns a deterministic palette colour per user id", () => {
        const a = collabColorFor("user-ada");
        const b = collabColorFor("user-ada");
        expect(a).toBe(b);
        expect(a).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("shows your face plus everyone else in the note, and a word only when offline", () => {
        const me = { id: "u-me", name: "Me Self" };
        const sam = { clientId: 2, userId: "u-sam", name: "Sam Chen", color: "#5dba72" };
        const kai = { clientId: 3, userId: "u-kai", name: "Kai Park", color: "#7eb8d4" };
        const faces = () => screen.queryAllByTestId("face").map((f) => f.getAttribute("data-user"));
        const ui = (status: "connecting" | "synced" | "offline", peers: (typeof sam)[]) => (
            <CollabNoteStatus status={status} peers={peers} self={me} projectId="p1" />
        );

        const { rerender } = render(ui("connecting", []));
        expect(screen.getByRole("status").textContent).toBe("Connecting…");
        expect(faces()).toEqual([]);

        rerender(ui("synced", []));
        expect(faces()).toEqual(["u-me"]);
        expect(screen.getByRole("status").textContent).toContain("Only you here");

        rerender(ui("synced", [sam, { ...sam, clientId: 9 }, { ...kai, userId: "u-me" }]));
        expect(faces()).toEqual(["u-me", "u-sam"]);
        expect(screen.getByRole("status").textContent).toContain("Me Self, Sam Chen here");

        rerender(ui("offline", []));
        expect(faces()).toEqual([]);
        expect(screen.getByRole("status").textContent).toContain("Offline");
    });

    it("only seeds an unseeded collab doc when this client has the lowest active clientID", () => {
        const handle = new CollabNoteHandle("task-1", { id: "u-1", name: "Ada", color: "#e8a44a" });
        const setContent = vi.fn();
        const editor = { isDestroyed: false, commands: { setContent } } as never;
        Object.defineProperty(handle.provider, "synced", { value: true, configurable: true });

        const lowerPeer = handle.doc.clientID - 1;
        vi.spyOn(handle.provider.awareness, "getStates").mockReturnValue(
            new Map([
                [lowerPeer, { user: { id: "u-2", name: "Sam" } }],
                [handle.doc.clientID, { user: { id: "u-1", name: "Ada" } }],
            ]),
        );
        handle.seedOnce(editor, "Hello world");
        expect(setContent).not.toHaveBeenCalled();

        vi.spyOn(handle.provider.awareness, "getStates").mockReturnValue(
            new Map([[handle.doc.clientID, { user: { id: "u-1", name: "Ada" } }]]),
        );
        handle.seedOnce(editor, "Hello world");
        expect(setContent).toHaveBeenCalledOnce();
        handle.destroy();
    });
});
