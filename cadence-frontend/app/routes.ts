import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("schedule", "routes/schedule.tsx"),
    route("upcoming", "routes/upcoming.tsx"),
    route("inbox", "routes/inbox.tsx"),
    route("completed", "routes/completed.tsx"),
    route("trash", "routes/trash.tsx"),
    route("project/:projectId", "routes/project.tsx"),
    route("auth/:pathname", "routes/auth.tsx"),
    route("habits", "routes/habits.tsx"),
    route("weekly-review", "routes/weekly-review.tsx"),
] satisfies RouteConfig;

