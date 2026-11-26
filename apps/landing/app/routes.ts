import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("terms", "routes/terms.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("changelog", "routes/changelog.tsx"),
    route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
