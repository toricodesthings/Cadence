import type { Config } from "@react-router/dev/config";

export default {
  // Static: every page is rendered once at build time and served by Workers Static Assets (no Worker runs).
  ssr: false,
  prerender: ["/", "/terms", "/privacy", "/404"],
} satisfies Config;
