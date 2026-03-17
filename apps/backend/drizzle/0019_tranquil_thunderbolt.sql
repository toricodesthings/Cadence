-- No-op: RLS policies and ENABLE ROW LEVEL SECURITY were already applied
-- in migration 0010_frontend_reliability_rls.sql (hand-written).
-- This migration exists only to sync Drizzle's snapshot state with schema.ts
-- declarations of .enableRLS() and pgPolicy().
SELECT 1;