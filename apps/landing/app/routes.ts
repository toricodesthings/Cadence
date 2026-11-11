import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  // Anything else is a page, not an error: prerendered once as /404 and served with a 404 status by the assets layer.
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
