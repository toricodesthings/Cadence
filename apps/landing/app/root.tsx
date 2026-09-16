import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { ButtonLink } from "./components/ButtonLink";
import { NotFound } from "./components/NotFound";
import { HEAD_SCRIPT } from "./lib/intro";
import appStylesHref from "./app.css?url";
import outfitLatinHref from "@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url";
import soraLatinHref from "@fontsource-variable/sora/files/sora-latin-wght-normal.woff2?url";

export const links: Route.LinksFunction = () => [
  // Fetch the Latin faces alongside the stylesheet instead of after it parses.
  { rel: "preload", href: soraLatinHref, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "preload", href: outfitLatinHref, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "stylesheet", href: appStylesHref },
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "apple-touch-icon", href: "/logo.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // The head script adds hero attributes before hydration; they are expected.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Blocking on purpose: it must hold the intro and flag a return visit before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
        <meta name="theme-color" content="#070e1a" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // A missing page is not an error to apologise for: it gets the scene, framed by the portrait boughs.
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <>
        <title>Page not found · Cadence</title>
        <NotFound />
      </>
    );
  }

  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : "Error";
    details =
      error.status === 404
        ? "There's nothing at this address."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="ambient-backdrop flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <title>{`${message} · Cadence`}</title>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-accent-primary">
        {message}
      </h1>
      <p className="mt-4 text-lg text-twilight-text-soft">{details}</p>
      {stack && (
        <pre className="mt-8 w-full max-w-2xl overflow-x-auto rounded-2xl border border-twilight-border bg-twilight-surface-muted p-4 text-left text-xs text-twilight-text-soft">
          <code>{stack}</code>
        </pre>
      )}
      <ButtonLink href="/" variant="ghost" className="mt-8">
        Back to home
      </ButtonLink>
    </main>
  );
}
