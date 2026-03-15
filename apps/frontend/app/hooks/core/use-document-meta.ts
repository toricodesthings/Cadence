import { useEffect } from "react";

function ensureDescriptionMeta() {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');

    if (!tag) {
        tag = document.createElement("meta");
        tag.name = "description";
        document.head.appendChild(tag);
    }

    return tag;
}

export function useDocumentMeta(title: string, description: string) {
    useEffect(() => {
        document.title = title;
        ensureDescriptionMeta().setAttribute("content", description);
    }, [title, description]);
}
