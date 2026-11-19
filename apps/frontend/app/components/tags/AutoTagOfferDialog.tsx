import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { useApiClient } from "../../hooks/auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { transformListCache } from "../../lib/api/cache-guards";
import { toastError } from "../../lib/utils/error-toast";
import { toastUndo } from "../../lib/utils/undo-toast";
import { useAutoTagOfferStore } from "../../stores/auto-tag-offer-store";
import type { Task } from "@cadence/contracts/task";

/** Add or remove one tag on these tasks in every cached list. */
function patchTagIds(queryClient: QueryClient, tagId: string, taskIds: string[], linked: boolean) {
    const ids = new Set(taskIds);
    queryClient.setQueriesData<Task[]>({ queryKey: queryKeys.tasks.all }, (old) =>
        transformListCache(old, (items) =>
            items.map((t) =>
                ids.has(t.id)
                    ? {
                          ...t,
                          tagIds: linked ? [...new Set([...t.tagIds, tagId])] : t.tagIds.filter((x) => x !== tagId),
                      }
                    : t,
            ),
        ),
    );
}

const count = (n: number) => `${n} task${n === 1 ? "" : "s"}`;

/** After a tag is made that is named like a list or section: tag the open tasks already there? Then an Undo. */
export function AutoTagOfferDialog() {
    const { offer, clear } = useAutoTagOfferStore();
    const client = useApiClient();
    const queryClient = useQueryClient();

    async function link(tagId: string, taskIds: string[], linked: boolean) {
        const res = await client.api.tags[":id"].tasks.$post({ param: { id: tagId }, json: { taskIds, linked } });
        const { taskIds: changed } = await unwrapResponse(res);
        patchTagIds(queryClient, tagId, changed, linked);
        return changed;
    }

    async function confirm() {
        if (!offer) return;
        const { tagId, tagName, taskIds } = offer;
        clear();
        try {
            const added = await link(tagId, taskIds, true);
            toastUndo(`Tagged ${count(added.length)}`, () => {
                link(tagId, added, false).catch((e) => toastError(e, `Couldn't untag from "${tagName}"`));
            });
        } catch (e) {
            toastError(e, "Couldn't tag those tasks");
        }
    }

    return (
        <AlertDialog.Root open={!!offer} onOpenChange={(open) => !open && clear()}>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>
                        Tag {offer ? count(offer.taskIds.length) : ""} in {offer?.places.join(" and ")}?
                    </AlertDialog.Title>
                    <AlertDialog.Description>
                        They'll get "{offer?.tagName}", like new tasks there.
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md">
                            Not now
                        </Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button size="md" onClick={confirm}>
                            Tag {offer ? count(offer.taskIds.length) : ""}
                        </Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}
