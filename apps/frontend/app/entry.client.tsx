import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { prefetchSavedWorkspace } from "./lib/api/persister";
import { readIdentity } from "./lib/auth/offline-identity";

if (readIdentity()) prefetchSavedWorkspace();

startTransition(() => {
    hydrateRoot(
        document,
        <StrictMode>
            <HydratedRouter />
        </StrictMode>,
    );
});
