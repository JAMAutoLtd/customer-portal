# Project Architecture Overview

This document provides a high-level overview of the JAM Auto monorepo structure, the interactions between its components, the core data flow, and the deployment strategy.

## 1. Monorepo Structure

This project utilizes a `pnpm` monorepo structure to manage multiple related applications and shared configurations. The key directories are:

*   **`apps/`**: Contains the individual applications.
    *   **`web/`**: A Next.js application serving as the customer-facing portal for placing orders and viewing information. It also likely includes admin/technician views.
    *   **`scheduler/`**: A Node.js/TypeScript backend service responsible for the core job scheduling and assignment logic.
    *   **`optimiser/`**: A Python/FastAPI backend service dedicated to solving the vehicle routing problem using Google OR-Tools.
*   **`simulation/`**: A Docker Compose environment used for local development and end-to-end testing. It simulates the backend dependencies (PostgreSQL database, PostgREST API layer, Optimizer service) allowing isolated testing of the scheduler.
*   **`docs/`**: Contains all project documentation, including technical references, database schema details, deployment information, and this architecture overview.
*   **Root Files**: Configuration files for the monorepo (`pnpm-workspace.yaml`, root `package.json`), shared configurations (`tsconfig.base.json`, `.eslintrc.js`, `.prettierrc.js`), testing setups (`jest.*.js`), the canonical database schema (`schema.sql`), and CI/CD configurations (`*.cloudbuild.yaml`).

## 2. Service Interactions & Data Flow

The system components interact in the following primary ways:

1.  **Order Placement (Frontend -> Supabase):**
    *   Customers use the `apps/web` frontend to submit service orders.
    *   The frontend interacts **directly with Supabase** (using the public Anon Key and respecting RLS policies) to:
        *   Fetch data (services, vehicles, user addresses, etc.).
        *   Create new records in the `orders`, `order_services`, and potentially `customer_vehicles` tables.

2.  **Scheduling Trigger (Supabase -> Edge Function -> Scheduler):**
    *   A Supabase Database Webhook listens for relevant changes (e.g., `INSERT` on `orders`, potentially `UPDATE` on `jobs`).
    *   The webhook triggers a Supabase Edge Function (`trigger-replan`).
    *   The Edge Function obtains a Google OIDC token (using a securely stored GCP Service Account key) and makes an authenticated `POST` request to the `/run-replan` endpoint of the deployed `apps/scheduler` service (`scheduler-node`) on Cloud Run.
    *   A periodic Cloud Scheduler job also triggers the `/run-replan` endpoint as a fallback or for regular batch processing.

3.  **Scheduling Process (Scheduler -> External APIs & Supabase):**
    *   The `apps/scheduler` service (`scheduler-node`) orchestrates the main logic:
        *   Fetches relevant data (technicians, jobs, equipment requirements) from **Supabase** (using the Service Role Key).
        *   Fetches real-time technician locations from the **One Step GPS API** (`/device-info` endpoint).
        *   Calculates travel times between locations using the **Google Maps Distance Matrix API**.
        *   Prepares an optimization payload defining the VRP.
        *   Sends the payload to the **`apps/optimiser` service** (`POST /optimize-schedule`).
        *   Receives the optimized routes (or unassigned items) from the optimizer.
        *   Processes the results and performs batch updates to the **Supabase** `jobs` table (setting `status`, `assigned_technician`, `estimated_sched`).

4.  **Optimization (Scheduler -> Optimizer):**
    *   The `apps/scheduler` calls the `apps/optimiser` service's `/optimize-schedule` endpoint via an HTTP POST request, sending the problem definition.
    *   The `apps/optimiser` service solves the VRP using Google OR-Tools and returns the solution (routes, unassigned items) in the response body.

5.  **Data Display (Frontend -> Supabase):**
    *   The `apps/web` frontend reads job statuses, schedules, technician assignments, etc., **directly from Supabase** to display information to users.

**Key Interaction Points:**

*   **Frontend <> Backend:** The frontend primarily interacts with Supabase, *not* directly with the backend scheduler or optimizer services.
*   **Scheduler <> Optimizer:** Direct HTTP communication.
*   **Scheduler <> Database:** Extensive interaction via Supabase client library.
*   **Scheduler <> External APIs:** Google Maps and One Step GPS.

## 3. Deployment Strategy

The different parts of the monorepo are deployed independently:

*   **`apps/web` (Frontend):** Deployed to **Vercel**. Vercel is configured to use `apps/web` as the root directory and ignores changes in other `apps/*` directories for its build triggers.
*   **`apps/scheduler` (Node.js Backend):** Deployed as a containerized service (`scheduler-node`) to **Google Cloud Run**. Deployment is automated via **Google Cloud Build**, triggered by changes within the `apps/scheduler/` path in the GitHub repository. Uses `apps/scheduler/cloudbuild.yaml`.
*   **`apps/optimiser` (Python Backend):** Deployed as a containerized service (`scheduler-optimize-service`) to **Google Cloud Run**. Deployment is automated via **Google Cloud Build**, triggered by changes within the `apps/optimiser/` path in the GitHub repository. Uses `apps/optimiser/cloudbuild.yaml`.

See `DEPLOYMENT.md` for detailed backend CI/CD configuration.

## 4. Core Technologies

*   **Monorepo Management:** pnpm Workspaces
*   **Frontend:** Next.js (React), TypeScript, Tailwind CSS (likely), Supabase Client JS
*   **Scheduler Backend:** Node.js, TypeScript, Express (for server), Supabase Client JS, Axios, Google Maps Client JS
*   **Optimizer Backend:** Python, FastAPI, Google OR-Tools, Pydantic
*   **Database:** PostgreSQL (via Supabase)
*   **Infrastructure:** Supabase (DB, Auth, Edge Functions, Webhooks), Google Cloud Platform (Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Cloud Scheduler), Vercel (Frontend Hosting)
*   **Testing:** Jest (Unit/Integration), Pytest (Python Unit), Docker/Docker Compose (Simulation/E2E) 

## 5. Future API Needs (Discussion Point)

Please consider if there are specific data aggregations, actions (other than creating an order), or views that cannot be efficiently or securely handled by direct Supabase queries from the frontend.

If such requirements exist (e.g., fetching a heavily processed data view, triggering a *different* specific backend action), we may need to add dedicated, authenticated API endpoints, likely as Supabase Edge Functions or potentially within the Next.js API routes (`apps/web/src/app/api/*`), to support the frontend. Let's discuss any potential needs. 