import { defineConfig } from "drizzle-kit";

process.loadEnvFile(".dev.vars");
const prod = process.env.DB_TARGET === "prod";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: (prod ? process.env.PROD_MANAGEMENT_DATABASE_URL : process.env.MANAGEMENT_DATABASE_URL)!,
    },
});
