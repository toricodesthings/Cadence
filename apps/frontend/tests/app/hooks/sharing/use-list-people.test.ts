import { describe, expect, it, vi } from "vitest";
import type { Project } from "@cadence/contracts/project";

const OWNER = "22222222-2222-4222-8222-222222222222";
const BEN = "33333333-3333-4333-8333-333333333333";
const fetched = [
    { userId: OWNER, name: "Ada", image: null, pronouns: null, role: "owner" },
    { userId: BEN, name: "Ben", image: null, pronouns: null, role: "view" },
];

vi.mock("../../../../app/hooks/auth/use-authed-query", () => ({
    useAuthedQuery: (options: (client: unknown) => { select: (data: typeof fetched) => unknown }) => ({
        data: options({}).select(fetched),
    }),
}));
vi.mock("../../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));

import { useListPeople } from "../../../../app/hooks/sharing/use-list-people";

describe("the people in a shared list", () => {
    it("shows a role the owner just changed, though the cached people still hold the old one", () => {
        const project = {
            id: "11111111-1111-4111-8111-111111111111",
            userId: OWNER,
            access: "owner",
            members: [{ userId: BEN, role: "edit", invitedBy: OWNER }],
        } as unknown as Project;
        const { data } = useListPeople(project) as { data: { userId: string; role: string }[] };
        expect(data.find((person) => person.userId === BEN)?.role).toBe("edit");
        expect(data.find((person) => person.userId === OWNER)?.role).toBe("owner");
    });
});
