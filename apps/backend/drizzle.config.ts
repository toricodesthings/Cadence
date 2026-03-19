import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load Wrangler's .dev.vars (not .env)
config({ path: '.dev.vars' });

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.PROD_MANAGEMENT_DATABASE_URL!,
    },
});
