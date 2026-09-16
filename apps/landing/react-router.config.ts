import type { Config } from "@react-router/dev/config";

export default {
  // Server-rendered on the Worker: the first paint is complete HTML, then it hydrates.
  ssr: true,
} satisfies Config;
