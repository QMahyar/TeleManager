# Frontend Template Migration

TeleManager's frontend was migrated from the local `TeleManager Shadcn Vite+BaseUI` template into this repository.

## Retained in this repo

- `apps/web` — Vite React application shell, config, theme provider, favicon assets, screens, and frontend code.
- `packages/ui` — shared shadcn/Base UI-style package, global styles, Tailwind-aware utilities, and reusable primitives.
- Root workspace files — `package.json`, `package-lock.json`, `turbo.json`, `tsconfig.json`, `.npmrc`, `.prettierrc`, and `.prettierignore`.
- FastAPI integration — `src/telemanager/main.py` serves `apps/web/dist` when available and keeps the Python backend as the API layer.

## Removed external dependency

The sibling folder `E:\Code\TeleManager Shadcn Vite+BaseUI` was only needed as the migration source. Its reusable source/config has been copied or adapted here. Generated folders such as `.git`, `node_modules`, and build artifacts were intentionally not retained.

## Future frontend work

Continue development from this repository only:

```bash
npm run dev
npm run build
python -m uvicorn telemanager.main:app --app-dir src --reload
```
