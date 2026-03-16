import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("today", "routes/today.tsx"),
    route("schedule", "routes/schedule.tsx"),
    route("upcoming", "routes/upcoming.tsx"),
    route("completed", "routes/completed.tsx"),
    route("trash", "routes/trash.tsx"),
    route("changelog", "routes/changelog.tsx"),
    route("privacy-policy", "routes/privacy-policy.tsx"),
    route("project/:projectId", "routes/project.tsx"),
    route("terms", "routes/terms.tsx"),
    route("auth/:pathname", "routes/auth.tsx"),
    route("habits", "routes/habits.tsx"),
    route("help-feedback", "routes/help-feedback.tsx"),
    route("weekly-review", "routes/weekly-review.tsx"),
] satisfies RouteConfig;
