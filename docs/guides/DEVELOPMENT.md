# Development Guide

This guide covers setting up the development environment, common development workflows, and specific considerations for frontend and backend development within the `jam-auto` pnpm monorepo.

### 1. Setup Instructions

**(Derived from `README.md`, `docs/developer-info.md`, `docs/archive/WORKFLOW.md`)**

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/JAMAutoLtd/customer-portal.git jam-auto
    cd jam-auto
    ```

2.  **Install Dependencies:**
    *   Ensure you have `pnpm` installed (`npm install -g pnpm`).
    *   Run `pnpm install` from the **root** directory of the repository. This installs dependencies for all workspace packages (`apps/*`).
        ```bash
        pnpm install
        ```
    *   **Important:** Do **not** run `pnpm install` within individual `apps/*` directories. All installation should happen from the root.

3.  **Environment Setup:**
    *   Copy the `.env.sample` file to `.env` in the root directory.
    *   Fill in the required environment variables. Key variables include:
        *   **Supabase (Frontend & Backend):**
            *   `NEXT_PUBLIC_SUPABASE_URL`: Public URL (used by `apps/web`).
            *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anonymous key (used by `apps/web`).
            *   `SUPABASE_SERVICE_ROLE_KEY`: Service Role key (required by `apps/scheduler` for backend operations).
            *   `SUPABASE_DB_PASSWORD`: Database password (for simulation environment).
        *   **Google Maps (Backend):**
            *   `GOOGLE_MAPS_API_KEY`: API Key (used by `apps/scheduler`).
        *   **Optimiser Service (Backend):**
            *   `OPTIMIZER_URL`: URL for the deployed `apps/optimiser` service (used by `apps/scheduler`).
        *   **One Step GPS (Backend):**
            *   `ONESTEP_GPS_API_KEY`: API Key for the One Step GPS service (used by `apps/scheduler`).
        *   **Simulation / Database:**
            *   `DATABASE_URL`: Connection string.
            *   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: For the simulation environment (`simulation/`).

### 2. Common Development Workflows

**(Derived from `README.md`, `docs/archive/WORKFLOW.md`)**

*   **Run Commands from Root:** All development commands (build, dev, test, lint, etc.) should generally be executed from the **root** directory of the monorepo using the scripts defined in the root `package.json`.
*   **PNPM Workspace Filtering Note:** There were historical issues with `pnpm --filter` correctly identifying workspace packages on some systems. As a workaround, the scripts in the root `package.json` use a `cd apps/<app-name>; pnpm run <script>; cd ../..` pattern. Rely on these root scripts for consistency.
*   **Running Dev Servers:**
    *   Frontend (`apps/web` on `localhost:3000`): `pnpm run dev`
    *   Scheduler (`apps/scheduler`): `pnpm run dev:scheduler`
    *   Optimiser (`apps/optimiser` on `localhost:8080`): `pnpm run dev:optimiser` (Requires Python/pip and dependencies from `apps/optimiser/requirements.txt` installed).
*   **Building for Production:**
    *   Build Frontend (`apps/web`): `pnpm run build:web`
    *   Build Scheduler (`apps/scheduler`): `pnpm run build:scheduler`
    *   *(Optimiser is typically built within its Docker container during deployment).*
*   **Running Tests:**
    *   Run all unit tests: `pnpm run test`
    *   Run Scheduler unit tests: `pnpm run test:scheduler`
    *   Run Optimiser unit tests: `pnpm run test:optimiser` (Requires `pytest`).
    *   Run E2E tests (requires Simulation environment): `pnpm run test:e2e`. See `simulation/README.md`.
*   **Linting & Formatting:**
    *   Run from the root:
        *   Lint: `pnpm run lint`
        *   Format: `pnpm run format`
*   **Cleaning:**
    *   Run `pnpm run clean` from the root to remove `node_modules`, lockfiles, and build artifacts across the workspace.

### 3. Frontend Development (`apps/web`)

**(Derived from `README.md`, `docs/developer-info.md`)**

*   **Primary Interaction:** The frontend application interacts **directly with the Supabase database** for most data fetching (jobs, technicians, orders) and for creating new orders. It uses the public Supabase URL and Anon Key defined in the environment variables (`NEXT_PUBLIC_...`).
*   **Authentication & RLS:** Frontend authentication is handled via Supabase Auth helpers. Ensure all direct Supabase queries from the frontend respect Row Level Security (RLS) policies defined in the database.
*   **No Direct Backend Calls:** The frontend **does not** directly call the `scheduler` or `optimiser` backend API endpoints. Scheduling is triggered automatically via database events (webhooks) or periodic jobs.
*   **Development Server:** Start the Next.js dev server using `pnpm run dev` from the root.
*   **Building:** Build the frontend for production using `pnpm run build:web` from the root.

### 4. Backend Development (`apps/scheduler`, `apps/optimiser`)

**(Derived from `README.md`, `docs/developer-info.md`)**

*   **Service Roles:**
    *   `apps/scheduler`: Node.js/TypeScript service that orchestrates the scheduling process. Fetches data from Supabase, gets real-time locations (One Step GPS), calculates travel times (Google Maps), calls the `optimiser` service, processes results, and updates Supabase.
    *   `apps/optimiser`: Python/FastAPI service that solves the Vehicle Routing Problem using Google OR-Tools, receiving requests from the `scheduler`.
*   **Triggering (`scheduler`):** The scheduler (`runFullReplan` function) is primarily triggered automatically by:
    *   Supabase Database Webhooks (listening for new orders/job updates) -> Supabase Edge Function (`trigger-replan`) -> Authenticated call to `/run-replan` on the Cloud Run service.
    *   A periodic Google Cloud Scheduler job.
*   **Interaction:** The `scheduler` calls the `optimiser` service via HTTP POST. Frontend does not directly interact with these services.
*   **Development Servers:**
    *   Scheduler: `pnpm run dev:scheduler` (from root).
    *   Optimiser: `pnpm run dev:optimiser` (from root, requires Python environment).
*   **Building (`scheduler`):** Build the scheduler service using `pnpm run build:scheduler` from the root. 
*   **Simulation Environment:** For local development and testing of the backend interaction (Scheduler <-> Optimizer <-> Database), use the Docker Compose environment defined in `simulation/`. Refer to `simulation/README.md` for setup and usage instructions, including how to run E2E tests (`pnpm run test:e2e`). 
    *   The simulation includes scripts for seeding baseline data and specific test scenarios (`simulation/scripts/db/seed/scenarios/`).
    *   Integration tests (`tests/integration/scheduler/`) verify the scheduler's behavior under various conditions seeded by these scenarios.
    *   **New Scenarios:**
        *   `unschedulable_fixed_time`: Tests the case where a job has a `fixed_schedule_time` that conflicts with a technician's availability exception (e.g., time off), ensuring the job is marked `pending_review`.
        *   `locked_job_impact`: Tests that the scheduler respects the implicit unavailability caused by an existing job in `en_route` or `in_progress` status, scheduling other jobs around it. 