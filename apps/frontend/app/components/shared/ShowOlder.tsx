import { Button } from "../primitives/Button";

/** The "Show older" button under a paged list; nothing once everything is loaded. */
export function ShowOlder({ loadMore, isFetching }: { loadMore?: () => void; isFetching: boolean }) {
    if (!loadMore) return null;
    return (
        <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={isFetching}>
                {isFetching ? "Loading…" : "Show older"}
            </Button>
        </div>
    );
}
