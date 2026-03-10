# Cadence Mobile

The mobile app is an Expo project that is still behind the frontend and backend in feature coverage. It now lives inside the shared workspace so it can consume backend RPC types and future shared packages without bespoke setup.

## Commands

Run from the repository root:

```bash
pnpm dev:mobile
pnpm --filter @cadence/mobile android
pnpm --filter @cadence/mobile ios
pnpm --filter @cadence/mobile web
pnpm --filter @cadence/mobile lint
pnpm --filter @cadence/mobile typecheck
```

Or run them from this directory with `pnpm <script>`.

## Notes

- This app uses Expo Router with file-based routes in `app/`.
- Backend RPC typing comes from `@cadence/backend`.
- The app remains in-progress; the web app and worker API are the primary production targets today.

## Related Docs

- [Workspace root](../../README.md)
- [Backend app](../backend/README.md)
