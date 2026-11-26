import "./platform/patch-desktop-fetch";

import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import { Loading, LoadingHost } from "./components/shared/Loading";
import { CardPage } from "./components/shared/CardPage";
import { ErrorDetails } from "./components/shared/ErrorDetails";
import { Button } from "./components/primitives/Button";
import { Providers } from "./providers";
import { RUNTIME_TARGET } from "./lib/env";
import { LOADING_BOOT_SCRIPT } from "./lib/themes/season";
import { DEV_SERVICE_WORKER_CLEANUP_SCRIPT } from "./lib/dev-service-worker-cleanup";
import { SESSION_PREFETCH_SCRIPT } from "./lib/auth/session-prefetch";
import { RESUME_ROUTE_SCRIPT } from "./lib/resume-route";
import appStylesHref from "./app.css?url";
import outfitLatinHref from "@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url";
import soraLatinHref from "@fontsource-variable/sora/files/sora-latin-wght-normal.woff2?url";
import "@fontsource-variable/outfit";
import "@fontsource-variable/sora";

import type { LinksFunction } from "react-router";

export const links: LinksFunction = () => [
    { rel: "stylesheet", href: appStylesHref },
    { rel: "preload", href: outfitLatinHref, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    { rel: "preload", href: soraLatinHref, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ...(RUNTIME_TARGET === "desktop"
        ? []
        : [
              { rel: "manifest" as const, href: "/manifest.webmanifest" },
              { rel: "apple-touch-icon" as const, href: "/apple-touch-icon.png" },
          ]),
];

export function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <meta name="theme-color" content="#0d0f14" />
                {RUNTIME_TARGET !== "desktop" && (
                    <>
                        <meta name="mobile-web-app-capable" content="yes" />
                        <meta name="apple-mobile-web-app-capable" content="yes" />
                        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
                        <meta name="apple-mobile-web-app-title" content="Cadence" />
                        <script
                            dangerouslySetInnerHTML={{
                                __html: `(function(){if(/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/.test(navigator.userAgent))){var v=document.querySelector('meta[name=viewport]');v&&v.setAttribute('content',v.content+', maximum-scale=1');}})()`,
                            }}
                        />
                    </>
                )}
                {RUNTIME_TARGET !== "desktop" && <script dangerouslySetInnerHTML={{ __html: RESUME_ROUTE_SCRIPT }} />}
                {RUNTIME_TARGET !== "desktop" && !import.meta.env.DEV && (
                    <script dangerouslySetInnerHTML={{ __html: SESSION_PREFETCH_SCRIPT }} />
                )}
                <title>Cadence</title>
                <meta
                    name="description"
                    content="Cadence is a calm, atmospheric planning workspace for tasks, routines, and weekly resets."
                />
                {import.meta.env.DEV && <script src="/redirect-localhost.js" />}
                {import.meta.env.DEV && (
                    <script dangerouslySetInnerHTML={{ __html: DEV_SERVICE_WORKER_CLEANUP_SCRIPT }} />
                )}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var d=document.documentElement,s=JSON.parse(localStorage.getItem('cadence-appearance')||'{}');if(s.theme==='daylight')d.setAttribute('data-theme','daylight');else if(s.theme==='system'&&window.matchMedia('(prefers-color-scheme:light)').matches)d.setAttribute('data-theme','daylight');if(s.palette&&s.palette!=='lantern')d.setAttribute('data-palette',s.palette);if(s.themePreset&&s.themePreset!=='default'&&s.themePreset!=='daylight-default')d.setAttribute('data-theme-preset',s.themePreset);}catch(e){}})()`,
                    }}
                />
                <script dangerouslySetInnerHTML={{ __html: LOADING_BOOT_SCRIPT }} />
                <Meta />
                <Links />
            </head>
            <body className="bg-twilight text-twilight-text">
                {children}
                <LoadingHost />
                <ScrollRestoration />
                <Scripts />
                {RUNTIME_TARGET !== "desktop" && !import.meta.env.DEV && <script src="/register-sw.js" />}
            </body>
        </html>
    );
}

export default function App() {
    return (
        <Providers>
            <Outlet />
        </Providers>
    );
}

export function HydrateFallback() {
    return <Loading />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
    let message = "Something went wrong";
    let details = "Cadence hit a problem it couldn't recover from. Copy the details below if you report it.";

    if (isRouteErrorResponse(error)) {
        message = error.status === 404 ? "Page not found" : `Error ${error.status}`;
        details = error.status === 404 ? "There's nothing at this address." : error.statusText || details;
    }
    const notFound = isRouteErrorResponse(error) && error.status === 404;

    return (
        <CardPage
            title={message}
            description={details}
            actions={
                <Button asChild size="md">
                    <a href="/">Go home</a>
                </Button>
            }
        >
            {!notFound && <ErrorDetails error={error} />}
        </CardPage>
    );
}
