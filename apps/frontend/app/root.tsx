import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { Loading } from "./components/shared/Loading";
import { Providers } from "./providers";
import "./app.css";

import type { LinksFunction } from "react-router";

export const links: LinksFunction = () => [
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Sora:wght@100..800&family=Outfit:wght@300;400;500;600;700&display=swap",
  },
  {
    rel: "manifest",
    href: "/manifest.webmanifest",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0d0f14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <title>Cadence</title>
        <meta
          name="description"
          content="Cadence is a calm, atmospheric planning workspace for tasks, habits, and weekly resets."
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (window.location.hostname === "127.0.0.1") {
                const url = new URL(window.location.href);
                url.hostname = "localhost";
                window.location.replace(url.toString());
              }
            `,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body className="bg-twilight text-twilight-text">
        {children}
        <ScrollRestoration />
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                window.addEventListener("load", function() {
                  navigator.serviceWorker.register("/sw.js").catch(function() {});
                });
              }
            `,
          }}
        />
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
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-twilight-base p-8 text-center text-twilight-text">
      <div className="w-full max-w-xl space-y-6 rounded-3xl border border-twilight-border bg-twilight-surface/50 p-8 pt-10 shadow-2xl backdrop-blur-xl">
        <h1 className="font-display text-4xl font-bold tracking-tight text-lantern/90">
          {message}
        </h1>
        <p className="text-lg text-twilight-text-muted">{details}</p>
        {stack && (
          <div className="mt-8 overflow-hidden rounded-xl border border-twilight-border bg-twilight-surface-muted">
            <pre className="w-full overflow-x-auto p-4 text-left text-[11px] leading-relaxed text-twilight-text-soft">
              <code>{stack}</code>
            </pre>
          </div>
        )}
        <div className="pt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-lantern/10 px-6 py-2.5 text-sm font-medium text-lantern transition-[background-color] hover:bg-lantern/20"
          >
            Return to Safety
          </a>
        </div>
      </div>
    </main>
  );
}
