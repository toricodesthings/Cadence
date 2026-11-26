import type { Config } from "@react-router/dev/config";

export default {
    ssr: false,
    prerender: ["/", "/terms", "/privacy", "/changelog", "/404"],
} satisfies Config;
