import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CHAT_FILE_LIMITS, CHAT_IMAGE_MEDIA_TYPE, CHAT_PDF_MEDIA_TYPE, type AiUsage } from "@cadence/contracts/ai";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { compressChatImage } from "../../lib/utils/image";
import type { ImageAllowance } from "../../lib/ai/usage";

type AttachmentPreview = {
    id: string;
    url: string;
    name: string;
    bytes: number;
    mediaType: typeof CHAT_IMAGE_MEDIA_TYPE | typeof CHAT_PDF_MEDIA_TYPE;
    pages?: number | null;
};

export type Attachment = AttachmentPreview &
    (
        | { status: "uploading" | "failed"; imageId?: never; blob?: never }
        | { status: "ready"; imageId: string; blob: Blob }
    );
export type ReadyAttachment = Extract<Attachment, { status: "ready" }>;

export function useChatAttachments({
    conversationId,
    imageAllowance,
    perMessage,
    onNotice,
}: {
    conversationId: string | null;
    imageAllowance: ImageAllowance;
    perMessage: number;
    onNotice: (notice: string | null) => void;
}) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const conversationIdRef = useRef(conversationId);
    conversationIdRef.current = conversationId;
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const attachmentsRef = useRef(attachments);
    attachmentsRef.current = attachments;

    const discardImage = useCallback(
        (imageId: string) => void client.api.ai.images[":id"].$delete({ param: { id: imageId } }).catch(() => {}),
        [client],
    );
    const clearAttachments = useCallback(
        (discard: boolean) => {
            const current = attachmentsRef.current;
            current.forEach((a) => URL.revokeObjectURL(a.url));
            if (discard) new Set(current.flatMap((a) => (a.imageId ? [a.imageId] : []))).forEach(discardImage);
            setAttachments([]);
        },
        [discardImage],
    );

    const uploadAttachment = async (localId: string, file: File) => {
        try {
            const isPdf = file.type === CHAT_PDF_MEDIA_TYPE;
            if (isPdf && file.size > CHAT_FILE_LIMITS.pdfMaxBytes) throw new Error("That PDF is larger than 5 MB.");
            const compressed = isPdf ? file : await compressChatImage(file);
            const res = await client.api.ai.images.$post({
                form: { file: compressed, conversationId: conversationIdRef.current! },
            });
            const data = await unwrapResponse(res);
            queryClient.setQueryData<AiUsage>(queryKeys.ai.usage, (prev) =>
                prev?.images ? { ...prev, images: { ...prev.images, ...data.images } } : prev,
            );
            const current = attachmentsRef.current;
            const self = current.find((a) => a.id === localId);
            const duplicate = current.some((a) => a.id !== localId && a.imageId === data.id);
            if (!self || duplicate) {
                if (self) {
                    URL.revokeObjectURL(self.url);
                    setAttachments((prev) => prev.filter((a) => a.id !== localId));
                    onNotice("That file is already attached.");
                } else if (!duplicate && !data.reused) {
                    discardImage(data.id);
                }
                return;
            }
            setAttachments((prev) =>
                prev.map((a) =>
                    a.id === localId
                        ? {
                              ...a,
                              status: "ready",
                              imageId: data.id,
                              blob: compressed,
                              bytes: compressed.size,
                              pages: data.pages,
                          }
                        : a,
                ),
            );
        } catch (error) {
            setAttachments((prev) =>
                prev.map((a) =>
                    a.id === localId ? { ...a, status: "failed", imageId: undefined, blob: undefined } : a,
                ),
            );
            onNotice(error instanceof Error && error.message ? error.message : "Couldn’t attach that file.");
        }
    };

    const addImages = (files: Iterable<File>) => {
        const images = [...files].filter((f) => f.type.startsWith("image/") || f.type === CHAT_PDF_MEDIA_TYPE);
        if (images.length === 0) return;
        if (imageAllowance.blocked) {
            onNotice(imageAllowance.label);
            return;
        }
        const cap = Math.min(perMessage, imageAllowance.left);
        const room = Math.max(0, cap - attachments.length);
        if (images.length > room) {
            onNotice(cap < perMessage ? imageAllowance.label : `Up to ${perMessage} files per message.`);
        }
        const added = images.slice(0, room).map((file) => ({ file, id: crypto.randomUUID() }));
        setAttachments((prev) => [
            ...prev,
            ...added.map(({ file, id }) => ({
                id,
                url: URL.createObjectURL(file),
                name: file.name || "Pasted photo",
                bytes: file.size,
                mediaType: (file.type === CHAT_PDF_MEDIA_TYPE
                    ? CHAT_PDF_MEDIA_TYPE
                    : CHAT_IMAGE_MEDIA_TYPE) as Attachment["mediaType"],
                status: "uploading" as const,
            })),
        ]);
        added.forEach(({ file, id }) => void uploadAttachment(id, file));
    };
    const removeAttachment = (id: string) => {
        const gone = attachments.find((a) => a.id === id);
        if (!gone) return;
        URL.revokeObjectURL(gone.url);
        if (gone.imageId && !attachments.some((a) => a.id !== id && a.imageId === gone.imageId))
            discardImage(gone.imageId);
        setAttachments((prev) => prev.filter((a) => a.id !== id));
    };
    useEffect(() => () => attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.url)), []);

    return {
        attachments,
        uploading: attachments.some((a) => a.status === "uploading"),
        readyImages: attachments.filter((a): a is ReadyAttachment => a.status === "ready"),
        clearAttachments,
        addImages,
        removeAttachment,
    };
}

export type ChatAttachments = ReturnType<typeof useChatAttachments>;
