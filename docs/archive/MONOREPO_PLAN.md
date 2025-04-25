> **Note:** This document outlines the historical plan for migrating to a monorepo structure. The current structure is reflected in the workspace configuration (`package.json`, `pnpm-workspace.yaml`) and the `apps/` directory layout. Refer to the main documentation in the `docs/` directory for current project details.

# Monorepo Migration Plan: jam-auto (customer-portal & scheduler-py)

**Goal:** Combine `scheduler-py` (Node.js backend, Python optimizer, Simulation env) and `customer-portal` (Next.js frontend) into a single monorepo structure within the existing `JAMAutoLtd/customer-portal` repository (which will become the `jam-auto` monorepo). Ensure each application (`web`, `scheduler`, `optimiser`) can be built and deployed independently (Vercel for frontend, GCP Cloud Run for backends).

**Chosen Method:** Manual file copy (Git history from `scheduler-py` will **not** be preserved in the merge).

**Target Monorepo Structure:** Using `pnpm` workspaces (recommended, but adaptable for npm/yarn).


```
jam-auto/ # Root of the repository
├── apps/
│ ├── web/ # Main Next.js web app (from customer-portal)
│ │ ├── src/
│ │ ├── public/
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ └── ... (Next.js config files)
│ ├── scheduler/ # Node.js backend app (from scheduler-py/src)
│ │ ├── src/
│ │ ├── tests/ # Unit tests for Node.js app
│ │ │ └── e2e/ # E2E tests (moved from root tests/)
│ │ ├── Dockerfile
│ │ ├── package.json
│ │ └── tsconfig.json
│ └── optimiser/ # Python backend app (from scheduler-py/optimize-service)
│ ├── main.py
│ ├── models.py
│ ├── tests/ # Unit tests for Python app
│ ├── Dockerfile
│ ├── requirements.txt
│ └── .dockerignore # Specific to this app
│
├── simulation/ # Migrated simulation environment (kept at root)
│
├── docs/ # Project documentation, architecture, specs
│ ├── index.md
│ └── ... (DB.md, OVERVIEW.md, etc.)
│
├── scripts/ # Utility or deployment scripts (optional)
│ ├── deploy-scheduler.sh # Example
│ └── deploy-optimiser.sh # Example
│
├── .dockerignore # Root dockerignore (for Cloud Build context)
├── .gitignore # Merged
├── package.json # Root package.json (workspaces configured)
├── pnpm-workspace.yaml # Defines pnpm workspaces
├── tsconfig.base.json # Base TS config
├── jest.config.js # Root Jest config (delegates to apps)
├── jest.e2e.config.js # E2E Jest config (runs tests in apps/scheduler/tests/e2e)
├── schema.sql # Shared DB schema
└── README.md # Main README

```

---


---

## Migration Plan

**Phase 1: Preparation**

1.  **Backup:** Create full backups or ensure easy restoration points for both the `scheduler-py` and `customer-portal` repositories.
2.  **Communication:** Inform relevant developers about the migration.
3.  **Clone Target Repo:** Clone a fresh copy of the `customer-portal` repository.
    ```bash
    git clone https://github.com/JAMAutoLtd/customer-portal.git jam-auto
    cd jam-auto
    ```
4.  **Create New Branch:** Create a feature branch for this migration work.
    ```bash
    git checkout -b feat/integrate-backend-monorepo
    ```
5.  **Choose & Setup Tooling:** Decide on `pnpm` (recommended), `npm`, or `yarn`. Install globally if needed (e.g., `npm install -g pnpm`).
6.  **Analyze Dependencies:** Review `package.json` from both projects.

**Phase 2: File Migration (Manual Copy)**

*(Perform these steps within your local `jam-auto` clone, copying files from a separate local clone of `scheduler-py`)*

1.  **Create `apps/` Structure:**
    ```bash
    mkdir apps
    mkdir apps/web
    mkdir apps/scheduler
    mkdir apps/optimiser
    mkdir apps/scheduler/tests # For Node tests
    mkdir apps/optimiser/tests # For Python tests
    ```
2.  **Move Existing Frontend:** Move the existing Next.js application code and its `package.json`, `tsconfig.json`, etc., from the root into `apps/web/`.
3.  **Copy Node.js Backend:**
    *   Copy `scheduler-py/src/` into `apps/scheduler/src/`.
    *   Copy `scheduler-py/Dockerfile` into `apps/scheduler/Dockerfile`.
    *   Copy `scheduler-py/tsconfig.json` into `apps/scheduler/tsconfig.json`.
    *   Copy `scheduler-py/tests/` (excluding e2e) into `apps/scheduler/tests/`.
    *   Copy `scheduler-py/tests/e2e/` into `apps/scheduler/tests/e2e/`.
    *   *(We'll create `apps/scheduler/package.json` in Phase 3).*
4.  **Copy Python Backend:**
    *   Copy the *contents* of `scheduler-py/optimize-service/` (excluding `.venv`, `__pycache__`, `.pytest_cache`, `tests/`) into `apps/optimiser/`.
    *   Copy `scheduler-py/optimize-service/tests/` into `apps/optimiser/tests/`.
5.  **Copy Simulation Environment:**
    *   Copy `scheduler-py/SIMULATION/` to the root `jam-auto/SIMULATION/`.
6.  **Copy/Merge Documentation:**
    *   Copy `scheduler-py/docs/` into `jam-auto/docs/`. Merge content if `jam-auto` already has a `docs` directory.
7.  **Copy/Merge Root Config Files:**
    *   Carefully copy relevant root config files from `scheduler-py` (`.gitignore`, `.dockerignore`, `.eslintrc.js`, `.prettierrc.js`, Jest configs, `schema.sql`, etc.) to the root of `jam-auto`. Prepare to merge/update them in the next phase.
    *   Delete the original root `tests/` directory from `scheduler-py` if copied.
8.  **Commit Initial File Structure:**
    ```bash
    git add .
    git commit -m "feat: Initial migration of backend files into apps/* structure"
    ```

**Phase 3: Configuration Merging & Workspace Setup**

1.  **Root `package.json`:**
    *   **Initialize Workspaces:** Create `pnpm-workspace.yaml` at the root:
        ```yaml
        # pnpm-workspace.yaml
        packages:
          - 'apps/*' # Includes web, scheduler, optimiser (if optimiser needs JS deps)
        ```
    *   **Define Root:** Ensure the root `package.json` has a suitable `name` (e.g., `jam-auto`), set `"private": true`.
    *   **Merge `devDependencies`:** Hoist common dev dependencies (TypeScript, ESLint, Prettier, Jest, etc.) from `apps/web/package.json` and `scheduler-py/package.json` into the *root* `package.json`. Remove them from `apps/web/package.json`.
    *   **Merge Scripts:** Prefix package-specific scripts. Add root scripts using workspace commands (e.g., `pnpm --filter <package-name> run <script>`):
        ```json
        // root package.json (example scripts)
        "scripts": {
          "dev": "pnpm --filter @jamauto/web run dev", // Assumes names like @jamauto/web
          "dev:scheduler": "pnpm --filter @jamauto/scheduler run dev",
          "dev:optimiser": "cd apps/optimiser && uvicorn main:app --reload --port 8080",
          "build": "pnpm run build --recursive --if-present",
          "build:web": "pnpm --filter @jamauto/web run build",
          "build:scheduler": "pnpm --filter @jamauto/scheduler run build",
          "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
          "format": "prettier --write .",
          "test": "pnpm test --recursive --if-present",
          "test:web": "pnpm --filter @jamauto/web run test", // If frontend has tests
          "test:scheduler": "pnpm --filter @jamauto/scheduler run test",
          "test:optimiser": "cd apps/optimiser && pytest",
          "test:e2e": "pnpm --filter @jamauto/scheduler run test:e2e", // Run E2E via scheduler package
          // ... other scripts
        }
        ```
2.  **Scheduler `package.json` (`apps/scheduler/package.json`):**
    *   Create this file. Define `name` (`@jamauto/scheduler`), `version`, `main` (`dist/server.js`).
    *   List only backend-specific dependencies (`@supabase/supabase-js`, `express`, etc.).
    *   Include necessary scripts (`build`, `start`, `dev`, `test`, `test:e2e`). Ensure `test:e2e` points to the correct config/path (`jest --config ../../jest.e2e.config.js tests/e2e`).
3.  **Web `package.json` (`apps/web/package.json`):**
    *   Update `name` (`@jamauto/web`). Remove hoisted dev dependencies. Keep frontend dependencies and scripts.
4.  **TypeScript Configuration:**
    *   **Root (`tsconfig.base.json`):** Create with common strict settings.
    *   **Scheduler (`apps/scheduler/tsconfig.json`):** Update to `extend` `../../tsconfig.base.json`, set `compilerOptions.outDir: "./dist"`, `compilerOptions.rootDir: "./src"`, adjust `include`/`exclude` to reference `src/**/*` and `tests/**/*`.
    *   **Web (`apps/web/tsconfig.json`):** Update to `extend` `../../tsconfig.base.json`, ensure Next.js types/libs are included, adjust `include`/`exclude`.
5.  **`.gitignore` (Root):** Merge patterns. Ensure robust coverage for `/node_modules`, `.env*`, `/apps/web/.next`, `/apps/scheduler/dist`, `/apps/optimiser/__pycache__`, `/apps/optimiser/.venv`, etc.
6.  **Dockerfiles & `.dockerignore`:**
    *   **Root `.dockerignore`:** Create/merge. Ignore other apps (e.g., ignore `apps/web/**`, `apps/optimiser/**` when building `scheduler`). Ignore `.git`, `.env*`, `SIMULATION/` etc.
    *   **Scheduler Dockerfile (`apps/scheduler/Dockerfile`):** Adjust `COPY` paths relative to the **build context**.
        *   If context is **root**: `COPY apps/scheduler/dist ./dist`, `COPY apps/scheduler/package.json ./`, `COPY pnpm-lock.yaml ./` etc.
        *   If context is **package** (`apps/scheduler`): `COPY dist ./dist`, `COPY package.json ./` etc. (Preferred context).
    *   **Optimiser Dockerfile (`apps/optimiser/Dockerfile`):** Adjust `COPY` paths similarly.
        *   If context is **root**: `COPY apps/optimiser/requirements.txt ./`, `COPY apps/optimiser/main.py ./` etc.
        *   If context is **package** (`apps/optimiser`): `COPY requirements.txt ./`, `COPY main.py ./` etc. (Preferred context).
    *   **Optimiser `.dockerignore` (`apps/optimiser/.dockerignore`):** Ensure paths are relative to `apps/optimiser`.
7.  **Jest Configuration:**
    *   **Root (`jest.config.js`):** Configure to use Jest projects/workspaces feature to find and run tests within `apps/*`.
    *   **E2E (`jest.e2e.config.js`):** Update `rootDir`, `testMatch` to point to `apps/scheduler/tests/e2e`.

**Phase 4: Path Adjustments & Verification**

1.  **Imports:** Check relative imports within each app's `src`.
2.  **Scripts:** Update paths in all `package.json` scripts, and crucially within `SIMULATION/run-e2e-tests.js` and `SIMULATION/generate-dynamic-seed.js` (paths to `docker-compose.yml`, `init-scripts`, test directories like `apps/scheduler/tests/e2e`).
3.  **Environment Variables:** Ensure `.env` files are loaded correctly (check `dotenv` paths in scripts/code).
4.  **Commit Configuration Changes:** Commit frequently.

**Phase 5: CI/CD Pipeline Adjustments**

1.  **Cloud Build (Backends):**
    *   Use separate triggers/configs. Set build context to the **package directory** (e.g., `apps/scheduler`).
    *   Configure triggers to watch specific app paths (e.g., `apps/scheduler/**`).
2.  **Vercel (Frontend):**
    *   Set **Root Directory** to `apps/web`.
    *   Configure **Ignored Build Step** for backend paths (`apps/scheduler/**`, `apps/optimiser/**`).
3.  **Cloud Run Deployment:** Use correct image URIs from specific builds.

**Phase 6: Testing**

1.  **Install:** `pnpm install` from root.
2.  **Lint/Format:** Run root scripts.
3.  **Unit Tests:** Run root `test` script.
4.  **Builds:** Test root `build` script.
5.  **E2E Tests:** Run root `test:e2e` script (or equivalent).
6.  **Deployment Tests:** Test individual builds & deploys.
7.  **Runtime Tests:** Test the full system.

**Phase 7: Documentation & Cleanup**

1.  **Update READMEs:** Update root README and app READMEs (if they exist).
2.  **Organize Docs:** Consolidate all docs into the root `docs/` folder.
3.  **Push & PR:** Push feature branch, create PR for review.
4.  **Archive Old Repo:** Archive `scheduler-py`.

---

This revised plan reflects your desired `apps/` structure. Let me know if you'd like any refinements, especially regarding the `SIMULATION` or `tests` locations if Option C wasn't your preference!