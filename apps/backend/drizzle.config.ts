import { defineConfig } from 'drizzle-kit';

// Load Wrangler's .dev.vars (not .env). DB_TARGET=prod (`db:migrate:prod`) targets production instead of dev.
process.loadEnvFile('.dev.vars');
const prod = process.env.DB_TARGET === 'prod';

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: (prod ? process.env.PROD_MANAGEMENT_DATABASE_URL : process.env.MANAGEMENT_DATABASE_URL)!,
    },
});
