import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Location } from "../../helpers";

const state = vi.hoisted(() => ({
    auth: { authReady: true, isAuthenticated: true, session: { user: { id: "33333333-3333-4333-8333-333333333333" } } },
    preview: { data: undefined as unknown, isPending: false, isError: false },
    projects: [] as { id: string }[],
    events: [] as { id: string }[],
    habits: [] as { id: string }[],
    join: vi.fn(),
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => state.auth }));
vi.mock("../../../app/hooks/core/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: state.projects }) }));
vi.mock("../../../app/hooks/calendar/use-personal-events", () => ({
    usePersonalEvents: () => ({ items: state.events }),
}));
vi.mock("../../../app/hooks/habits/use-habits", () => ({
    useAllHabits: () => ({ data: state.habits }),
}));
vi.mock("../../../app/hooks/sharing/use-share-list", () => ({
    useInvitePreview: () => state.preview,
    useJoinInvite: () => ({ mutate: state.join, isPending: false }),
}));
vi.mock("../../../app/components/shared/CardPage", () => ({
    CardPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
    rise: {},
    stagger: {},
}));

import JoinRoute from "../../../app/routes/join";

const TOKEN = "A".repeat(43);
const listPreview = {
    kind: "list" as const,
    listId: "11111111-1111-4111-8111-111111111111",
    name: "Our House",
    emoji: "🏠",
    colorAccent: "luminous-amber",
    ownerId: "22222222-2222-4222-8222-222222222222",
    ownerName: "Ada",
    ownerImage: null,
};

const eventPreview = {
    kind: "event" as const,
    eventId: "44444444-4444-4444-8444-444444444444",
    label: "Our anniversary",
    emoji: "💍",
    monthDay: "06-14",
    startedOn: "2019-06-14",
    color: "rose",
    ownerId: "22222222-2222-4222-8222-222222222222",
    ownerName: "Tori",
    ownerImage: null,
};

function renderJoin() {
    return render(
        <MemoryRouter initialEntries={[`/join/${TOKEN}`]}>
            <Routes>
                <Route path="/join/:token" element={<JoinRoute />} />
                <Route path="*" element={<Location />} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    state.auth = {
        authReady: true,
        isAuthenticated: true,
        session: { user: { id: "33333333-3333-4333-8333-333333333333" } },
    };
    state.preview = { data: listPreview, isPending: false, isError: false };
    state.projects = [];
    state.events = [];
    state.habits = [];
    state.join.mockReset();
});

describe("the join screen", () => {
    it("shows the list and who shared it, and says what joining shows, before anything is joined", () => {
        renderJoin();
        expect(screen.getByRole("heading", { name: "Our House" })).toBeTruthy();
        expect(screen.getByText("🏠")).toBeTruthy();
        expect(screen.getByText("Shared by Ada")).toBeTruthy();
        expect(
            screen.getByText("Joining shows you this list. People in it will see your name, picture and pronouns."),
        ).toBeTruthy();
        expect(state.join).not.toHaveBeenCalled();
    });

    it("joins a list on the button and opens it", async () => {
        state.join.mockImplementation((_token: string, options: { onSuccess: (joined: unknown) => void }) =>
            options.onSuccess({ kind: "list", listId: listPreview.listId }),
        );
        renderJoin();
        fireEvent.click(screen.getByRole("button", { name: "Join list" }));
        expect(state.join.mock.calls[0][0]).toBe(TOKEN);
        await waitFor(() =>
            expect(screen.getByLabelText("Current location").textContent).toBe(`/project/${listPreview.listId}`),
        );
    });

    it("shows the event-shaped screen and navigates to /events on Add to my events", async () => {
        state.preview = { data: eventPreview, isPending: false, isError: false };
        state.join.mockImplementation((_token: string, options: { onSuccess: (joined: unknown) => void }) =>
            options.onSuccess({ kind: "event", eventId: eventPreview.eventId }),
        );
        renderJoin();
        expect(screen.getByText("💍")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Our anniversary" })).toBeTruthy();
        expect(screen.getByText("Every June 14")).toBeTruthy();
        expect(screen.getByText("Since 2019")).toBeTruthy();
        expect(screen.getByText("Tori is sharing this date with you")).toBeTruthy();
        expect(screen.getByText("Tori will see your name, picture and pronouns.")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Add to my events" }));
        await waitFor(() => expect(screen.getByLabelText("Current location").textContent).toBe("/events"));
    });

    it("uses the party emoji fallback and omits Since when startedOn is null", () => {
        state.preview = {
            data: { ...eventPreview, emoji: null, startedOn: null },
            isPending: false,
            isError: false,
        };
        renderJoin();
        expect(screen.getByText("🎉")).toBeTruthy();
        expect(screen.queryByText(/Since /)).toBeNull();
    });

    it("redirects straight to /events when the event is already added", async () => {
        state.preview = { data: eventPreview, isPending: false, isError: false };
        state.events = [{ id: eventPreview.eventId }];
        renderJoin();
        await waitFor(() => expect(screen.getByLabelText("Current location").textContent).toBe("/events"));
    });

    it("leaves for Today on Not now, joining nothing", () => {
        renderJoin();
        fireEvent.click(screen.getByRole("button", { name: "Not now" }));
        expect(screen.getByLabelText("Current location").textContent).toBe("/today");
        expect(state.join).not.toHaveBeenCalled();
    });

    it("goes straight to a list the person is already in", async () => {
        state.projects = [{ id: listPreview.listId }];
        renderJoin();
        await waitFor(() =>
            expect(screen.getByLabelText("Current location").textContent).toBe(`/project/${listPreview.listId}`),
        );
    });

    it("says a dead link was reset or expired, and asks for a new one", () => {
        state.preview = { data: undefined, isPending: false, isError: true };
        renderJoin();
        expect(screen.getByText("This link has expired or was reset.")).toBeTruthy();
        expect(screen.getByText("Ask for a new one.")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Join list" })).toBeNull();
    });

    it("sends a signed-out visitor to sign in and back", async () => {
        state.auth = { authReady: true, isAuthenticated: false, session: null as never };
        renderJoin();
        await waitFor(() =>
            expect(screen.getByLabelText("Current location").textContent).toBe(
                `/auth/sign-in?redirectTo=${encodeURIComponent(`/join/${TOKEN}`)}`,
            ),
        );
    });

    it.each([
        [
            "together",
            "Do it together with Tori",
            "Tori will see when you check it off, plus your name, picture and pronouns.",
            "Add to my routines",
        ],
        [
            "turns",
            "Take turns with Tori and Sam",
            "Tori will see when you check it off, plus your name, picture and pronouns.",
            "Add to my routines",
        ],
        [
            "cheering",
            "Cheer Tori on",
            "You'll see the days Tori does it. Tori will see your name, picture and pronouns.",
            "Start cheering",
        ],
    ] as const)(
        "shows routine accept screen for way=%s and navigates to /routines",
        async (way, fromText, privacyText, buttonLabel) => {
            const routineId = "55555555-5555-4555-8555-555555555555";
            state.preview = {
                data: {
                    kind: "routine",
                    routineId,
                    title: "Morning yoga",
                    emoji: "🧘",
                    colorAccent: "emerald",
                    recurrenceRule: "FREQ=DAILY",
                    targetTime: "07:00",
                    times: null,
                    way,
                    ownerId: "22222222-2222-4222-8222-222222222222",
                    ownerName: "Tori",
                    ownerImage: null,
                    people: [{ name: "Sam", image: null }],
                },
                isPending: false,
                isError: false,
            };
            state.join.mockImplementation((_token: string, options: { onSuccess: (joined: unknown) => void }) =>
                options.onSuccess({ kind: "routine", routineId }),
            );
            renderJoin();
            expect(screen.getByText(fromText)).toBeTruthy();
            expect(screen.getByText(privacyText)).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: buttonLabel }));
            await waitFor(() => expect(screen.getByLabelText("Current location").textContent).toBe("/routines"));
        },
    );
});
