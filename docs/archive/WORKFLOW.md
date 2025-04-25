> **Note:** This document describes a historical workflow detail regarding `pnpm --filter` behavior. While potentially still relevant, refer to the main project `README.md` and `docs/` directory for current development practices.

# Monorepo Workflow Notes

This document outlines key findings and the established workflow for this pnpm monorepo.

## PNPM Workspace Setup & Filtering Issue

We successfully configured the project as a pnpm workspace according to the `MONOREPO_PLAN.md`:

*   Created `pnpm-workspace.yaml` defining `apps/*` as packages.
*   Created a root `package.json` hoisting common devDependencies.
*   Created/modified `package.json` files within `apps/web` and `apps/scheduler` with package-specific dependencies.
*   Created a root `tsconfig.base.json` and updated app-specific `tsconfig.json` files to extend it.

**Problem Encountered:**

Despite the configuration appearing correct, `pnpm` (version 10.9.0 on Windows) consistently failed to recognize the workspace packages when using the `--filter` flag (e.g., `pnpm --filter @jamauto/web ...` or `pnpm --filter ./apps/web ...`). This occurred even after clearing `node_modules`, deleting `pnpm-lock.yaml`, recreating `pnpm-workspace.yaml`, and running `pnpm install` successfully from the root.

**Workaround:**

The effective workaround is to modify the scripts in the **root `package.json`** to change directory (`cd`) into the specific app's folder before executing the `pnpm run <script>` command, and then changing back (`cd ../..`).

*Example (using PowerShell syntax for compatibility):*

```json
// In root package.json
"scripts": {
  "build:web": "cd apps/web; pnpm run build; cd ../..",
  "build:scheduler": "cd apps/scheduler; pnpm run build; cd ../..",
  // ... other scripts similarly modified
}
```

This ensures the script executes within the correct package context where `pnpm` can find the locally defined script and its dependencies.

## Recommended Workflow

1.  **Installation:**
    *   Always run `pnpm install` from the **root** of the project.
    *   Do **not** run `pnpm install` within individual `apps/*` directories.

2.  **Building:**
    *   To build a specific app, use the scripts defined in the **root `package.json`**:
        *   `pnpm run build:web`
        *   `pnpm run build:scheduler`
    *   Do **not** rely on `pnpm --filter ... run build` due to the observed issues.
    *   The Python app (`optimiser`) doesn't have a `pnpm build` script; its dependencies are managed via `requirements.txt` and likely built within its Docker context.

3.  **Running Dev Servers:**
    *   Use the scripts in the **root `package.json`**:
        *   `pnpm run dev` (for `web`)
        *   `pnpm run dev:scheduler`
        *   `pnpm run dev:optimiser` (uses `uvicorn` directly)

4.  **Testing:**
    *   Use the scripts in the **root `package.json`**:
        *   `pnpm run test:web`
        *   `pnpm run test:scheduler`
        *   `pnpm run test:optimiser` (uses `pytest` directly)
        *   `pnpm run test:e2e` (runs via the scheduler package context)

5.  **Linting/Formatting:**
    *   Run from the **root**:
        *   `pnpm run lint`
        *   `pnpm run format`

6.  **Cleaning:**
    *   Run `pnpm run clean` from the root to remove `node_modules`, lockfiles, and build artifacts. 