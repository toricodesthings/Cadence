# Proxy — Agent Instructions

Part of the backend: `apps/backend/AGENTS.md` §6 applies.

## Routes

- **proxy** (`/proxy`): proxied external calls: weather, reverse/forward geocoding, approximate location (`GET /geo/approximate` from Cloudflare `request.cf`), holidays. Coordinates are rounded to 2 decimals before upstream calls; successful holiday responses share an edge cache (dates 7 days, metadata 1 day), with failures uncached.
