-- The endpoint handover names the accounts it took the endpoint from, so their reminder clocks can be rebuilt without it.
DROP FUNCTION IF EXISTS "push_release_endpoint"(text, uuid);--> statement-breakpoint
CREATE FUNCTION "push_release_endpoint"(ep text, keep uuid) RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM devices WHERE endpoint = ep AND user_id <> keep RETURNING user_id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "push_release_endpoint"(text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "push_release_endpoint"(text, uuid) TO api_worker;
