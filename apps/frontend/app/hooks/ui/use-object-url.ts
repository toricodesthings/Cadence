import { useEffect, useState } from "react";

/** Keep an object URL alive for as long as the blob is on screen. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!blob) {
            setUrl(null);
            return;
        }
        const objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [blob]);

    return url;
}
