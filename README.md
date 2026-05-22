# Data Grid Performance Comparison

Standalone Vite app for comparing MUI X Data Grid Premium, DevExtreme React DataGrid, and AG Grid Enterprise with shared generated data.

## Local Development

```bash
pnpm install
pnpm dev
```

Open http://127.0.0.1:5178/.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Private GitHub Repo

After authenticating `gh` with `gh auth login`, run:

```bash
git init
git add .
git commit -m "Initial data grid performance comparison app"
gh repo create data-grid-performance-comparison --private --source=. --remote=origin --push
```

## Vercel

After installing/authenticating the Vercel CLI, run:

```bash
pnpm install
pnpm build
vercel
vercel --prod
```

For Vercel settings, use:

- Framework preset: Vite
- Build command: `pnpm build`
- Output directory: `dist`
