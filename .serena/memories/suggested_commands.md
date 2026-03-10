Workspace commands from repo root:
- pnpm install
- pnpm dev (frontend + backend)
- pnpm dev:frontend
- pnpm dev:backend
- pnpm dev:mobile
- pnpm build
- pnpm typecheck
- pnpm lint
- pnpm cf-typegen
- pnpm db:generate
- pnpm db:migrate
- pnpm db:studio
- pnpm deploy:frontend
- pnpm deploy:frontend:dev
- pnpm deploy:backend
Per-app commands are also available with pnpm --filter <package> <script>, using package names @cadence/frontend, @cadence/backend, and @cadence/mobile.