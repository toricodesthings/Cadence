import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("browse", "routes/browse.tsx"),
    route("desktop/quick-capture", "routes/desktop.quick-capture.tsx"),
    route("today", "routes/today.tsx"),
    route("schedule", "routes/schedule.tsx"),
    route("events", "routes/events.tsx"),
    route("upcoming", "routes/upcoming.tsx"),
    route("completed", "routes/completed.tsx"),
    route("trash", "routes/trash.tsx"),
    route("changelog", "routes/changelog.tsx"),
    route("privacy-policy", "routes/legal-redirect.tsx", { id: "privacy-redirect" }),
    route("project/:projectId", "routes/project.tsx"),
    route("tag/:tagId", "routes/tag.tsx"),
    route("terms", "routes/legal-redirect.tsx", { id: "terms-redirect" }),
    route("auth/:pathname", "routes/auth.tsx"),
    route("connect", "routes/connect.tsx"),
    route("routines", "routes/routines.tsx"),
    route("habits", "routes/habits-redirect.tsx"),
    route("help-feedback", "routes/help-feedback.tsx"),
    route("weekly-review", "routes/weekly-review.tsx"),
] satisfies RouteConfig;
