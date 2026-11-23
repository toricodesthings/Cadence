import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "../../../helpers";

const state = vi.hoisted(() => ({
    access: { role: "owner", isShared: false, canEdit: true, isOwner: true } as Record<string, unknown>,
    person: { name: "Ben" } as { name: string } | undefined,
    former: false,
}));

vi.mock("../../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ session: { user: { id: "me-1" } } }),
}));
vi.mock("../../../../app/hooks/sharing/use-list-access", () => ({ useTaskAccess: () => state.access }));
vi.mock("../../../../app/hooks/sharing/use-list-people", () => ({
    usePersonInList: () => ({ person: state.person, former: state.former, loaded: true, project: { userId: "o" } }),
}));
vi.mock("../../../../app/components/sharing/PersonAvatar", () => ({ PersonAvatar: () => <span>avatar</span> }));
vi.mock("../../../../app/hooks/tasks/use-archive-task", () => ({ useArchiveTask: () => ({ mutate: vi.fn() }) }));
vi.mock("../../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutate: vi.fn() }) }));
vi.mock("../../../../app/hooks/tasks/use-duplicate-task", () => ({ useDuplicateTask: () => ({ mutate: vi.fn() }) }));
vi.mock("../../../../app/hooks/tasks/use-find-time", async () => {
    const { createContext } = await import("react");
    return { canFindTime: () => false, FindTimeDayContext: createContext(null), useFindTime: () => ({ run: vi.fn() }) };
});
vi.mock("../../../../app/hooks/ai/use-planning-offers", () => ({ OFFER_LABEL: {}, useShownOffer: () => null }));
vi.mock("../../../../app/hooks/tags/use-task-tags", () => ({
    useAddTaskTag: () => ({ mutate: vi.fn() }),
    useRemoveTaskTag: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: {} }) }));
vi.mock("../../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: false }) }));
vi.mock("../../../../app/components/tasks/PriorityPicker", () => ({ PriorityPicker: () => <div>Priority</div> }));
vi.mock("../../../../app/components/tasks/EffortPicker", () => ({ EffortPicker: () => <div>Effort</div> }));
vi.mock("../../../../app/components/tasks/TagPickerSubmenu", () => ({ TagPickerSubmenu: () => <div>Tags</div> }));
vi.mock("../../../../app/components/tasks/MoveToSubmenu", () => ({ MoveToSubmenu: () => <div>Move to list</div> }));
vi.mock("../../../../app/components/tasks/MoveToSectionSubmenu", () => ({
    MoveToSectionSubmenu: () => <div>Move to section</div>,
}));
vi.mock("../../../../app/components/tasks/QuickScheduleSurface", () => ({ QuickScheduleSurface: () => null }));

import { TaskContextMenu } from "../../../../app/components/tasks/TaskContextMenu";

const task = makeTask({ title: "Buy milk", projectId: "11111111-1111-4111-8111-111111111111" });

function openMenu(onOpen?: () => void) {
    render(<TaskContextMenu task={task} onOpen={onOpen} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Open actions for Buy milk" }), {
        button: 0,
        ctrlKey: false,
    });
}

beforeEach(() => {
    state.access = { role: "owner", isShared: false, canEdit: true, isOwner: true };
    state.person = { name: "Ben" };
    state.former = false;
});

describe("a task menu in a shared list", () => {
    it("names who made the task, under everything else", async () => {
        state.access = { role: "edit", isShared: true, canEdit: true, isOwner: false };
        openMenu();
        expect(await screen.findByText("Created by Ben")).toBeTruthy();
    });

    it("says a former member made it when they're gone", async () => {
        state.access = { role: "edit", isShared: true, canEdit: true, isOwner: false };
        state.person = undefined;
        state.former = true;
        openMenu();
        expect(await screen.findByText("Created by a former member")).toBeTruthy();
    });

    it("shows personal reminders, tags and taking to an editor while keeping Move to list owner-only", async () => {
        state.access = { role: "edit", isShared: true, canEdit: true, isOwner: false };
        openMenu();
        await screen.findByText("Created by Ben");
        expect(screen.getByText("Set Reminder")).toBeTruthy();
        expect(screen.getByText("Tags")).toBeTruthy();
        expect(screen.getByText("I'll do it")).toBeTruthy();
        expect(screen.queryByText("Move to list")).toBeNull();
        expect(screen.getByText("Move to section")).toBeTruthy();
        expect(screen.getByText("Reschedule")).toBeTruthy();
    });

    it("shows Not doing it when taken by caller and Clear {name} for owner on someone else's take", async () => {
        state.access = { role: "edit", isShared: true, canEdit: true, isOwner: false };
        const mine = makeTask({
            title: "Buy milk",
            projectId: "11111111-1111-4111-8111-111111111111",
            takenBy: "me-1",
        });
        const { unmount } = render(<TaskContextMenu task={mine} />);
        fireEvent.pointerDown(screen.getByRole("button", { name: "Open actions for Buy milk" }), {
            button: 0,
            ctrlKey: false,
        });
        expect(await screen.findByText("Not doing it")).toBeTruthy();
        unmount();

        state.access = { role: "owner", isShared: true, canEdit: true, isOwner: true };
        const bens = makeTask({
            title: "Buy milk",
            projectId: "11111111-1111-4111-8111-111111111111",
            takenBy: "ben-1",
        });
        render(<TaskContextMenu task={bens} />);
        fireEvent.pointerDown(screen.getByRole("button", { name: "Open actions for Buy milk" }), {
            button: 0,
            ctrlKey: false,
        });
        expect(await screen.findByText("Clear Ben")).toBeTruthy();
    });

    it("keeps everything for the owner of a shared list", async () => {
        state.access = { role: "owner", isShared: true, canEdit: true, isOwner: true };
        openMenu();
        await screen.findByText("Created by Ben");
        expect(screen.getByText("Set Reminder")).toBeTruthy();
        expect(screen.getByText("Tags")).toBeTruthy();
        expect(screen.getByText("Move to list")).toBeTruthy();
    });

    it("offers a viewer Open, personal Reminder, Tags and who made the task, never edits or taking", async () => {
        state.access = { role: "view", isShared: true, canEdit: false, isOwner: false };
        const onOpen = vi.fn();
        openMenu(onOpen);
        expect(await screen.findByText("Set Reminder")).toBeTruthy();
        expect(screen.getByText("Tags")).toBeTruthy();
        expect(screen.queryByText("I'll do it")).toBeNull();
        expect(screen.queryByText("Reschedule")).toBeNull();
        expect(screen.queryByText("Move to Trash")).toBeNull();
        fireEvent.click(screen.getByText("Open"));
        expect(onOpen).toHaveBeenCalled();
    });

    it("shows no creator line or taking in a list that isn't shared", async () => {
        openMenu();
        await screen.findByText("Reschedule");
        expect(screen.queryByText(/Created by/)).toBeNull();
        expect(screen.queryByText("I'll do it")).toBeNull();
    });
});
