import { useEffect } from "react";

/** The tab title. (A rendered `<title>` would sit behind root's static one, and the first wins.) */
export function useDocumentTitle(title: string) {
    useEffect(() => {
        document.title = title;
    }, [title]);
}
