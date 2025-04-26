# docs/proposals/simulation-plan.md

## Local Containerized Testing Environment Plan (Updated)

**Goal:** Create a local, containerized End-to-End (E2E) testing environment using Docker Compose that mirrors the production setup by connecting the local services (`web`, `scheduler`, `optimiser`) to a **live staging Supabase project**. This environment utilizes the existing `.env.test` file for configuration.

**Based on:**

*   Analysis of `apps/web/next.config.ts`, `apps/web/src/app/api/order-submit/route.ts`, `apps/scheduler/src/supabase/client.ts`, `apps/scheduler/src/scheduler/optimize.ts`, `apps/optimiser/main.py`, `apps/web/Dockerfile`, `apps/scheduler/Dockerfile`, `apps/optimiser/Dockerfile`.
*   Requirement to use a live staging Supabase instance.
*   Requirement to use a root `.env.test` file for configuration.
*   Debugging process for Docker build and runtime issues.

---

### Implementation Status & Findings

*   **[x] `docker-compose.test.yml` Created:** A Docker Compose file specifically for this testing environment has been created at the root.
*   **[x] `.env.test` Utilized:** Configuration relies on the `.env.test` file for runtime environment variables, including staging Supabase credentials and local service URLs.
*   **[x] Dockerfiles Configured:** Dockerfiles for `web`, `scheduler`, and `optimiser` were reviewed and configured for multi-stage builds.
*   **[x] Successful Image Builds:** All service images (`optimiser`, `scheduler`, `web`) now build successfully using `docker-compose -f docker-compose.test.yml build`.
    *   **Finding 1 (Build - Host `node_modules`):** Initial builds failed with `archive/tar: unknown file mode ?rwxr-xr-x` errors.
        *   **Resolution:** Added `**/node_modules` to `.dockerignore` and ensured Dockerfiles perform `pnpm install` *inside* the container.
    *   **Finding 2 (Build - Next.js Standalone Output):** `web` build failed with `/app/apps/web/.next/standalone`: not found`.
        *   **Resolution:** Added `output: 'standalone'` to `apps/web/next.config.ts`. Corrected a typo in the package name filter (`@jam-auto/web...` -> `@jamauto/web`) in `apps/web/Dockerfile`.
    *   **Finding 3 (Build - Next.js Environment Variables):** `web` build failed with `Missing NEXT_PUBLIC_SUPABASE_URL`.
        *   **Resolution:** Implemented passing required `NEXT_PUBLIC_...` variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NHTSA_API_URL`) as build arguments using `build.args` in `docker-compose.test.yml` and corresponding `ARG` declarations in `apps/web/Dockerfile`. Ensured variables are present in `.env.test`. This is the correct pattern for Next.js build-time variables.
    *   **Finding 4 (Build - Scheduler Lockfile):** `scheduler` build failed with `ERR_PNPM_OUTDATED_LOCKFILE` after adding `dotenv` dependency.
        *   **Resolution:** Ran `pnpm install` locally to update `pnpm-lock.yaml`.
*   **[x] Runtime Issues Resolved:** All services (`optimiser`, `scheduler`, `web`) now start and run successfully using `docker-compose -f docker-compose.test.yml up -d`.
    *   **Finding 5 (Runtime - Optimiser Healthcheck):** `optimiser` failed health checks (`curl: command not found`) despite the app running.
        *   **Resolution:** Added `RUN apt-get update && apt-get install -y curl ...` to `apps/optimiser/Dockerfile` to ensure `curl` is available in the image. Adjusted healthcheck timing parameters (`timeout`, `retries`) in `docker-compose.test.yml` for robustness.
    *   **Finding 6 (Runtime - Scheduler):** `scheduler` entered a restart loop (`Error: Cannot find module 'dotenv'`).
        *   **Resolution:** Added `dotenv` to `dependencies` (not just `devDependencies`) in `apps/scheduler/package.json` and updated the lockfile.
    *   **Finding 7 (Runtime - Web):** `web` entered a restart loop (`/bin/sh: 1: [node,: not found`). The exec form `CMD ["node", "..."]` was being misinterpreted.
        *   **Resolution:** Changed `apps/web/Dockerfile` to use the shell form `CMD node apps/web/server.js` and ensured an empty `ENTRYPOINT [""]` was set.

---

### 1. Docker Compose Configuration (`docker-compose.test.yml`) **(Implemented & Working)**

```yaml
# docker-compose.test.yml
version: '3.8' # Note: Version attribute is obsolete but kept for reference

services:
  # Optimiser Service (Python Backend)
  optimiser:
    build:
      context: ./apps/optimiser
      dockerfile: Dockerfile
    container_name: test_optimiser
    ports:
      - "8081:8080" # Expose on host 8081
    env_file:
      - ./.env.test
    networks:
      - test-network
    restart: unless-stopped
    healthcheck:
      # Verbose check with adjusted timings
      test: ["CMD", "curl", "-v", "-f", "--connect-timeout", "5", "--max-time", "10", "http://localhost:8080/health"]
      interval: 15s
      timeout: 10s
      retries: 10
      start_period: 30s

  # Scheduler Service (Node.js Backend)
  scheduler:
    build:
      context: .
      dockerfile: apps/scheduler/Dockerfile
    container_name: test_scheduler
    env_file:
      - ./.env.test
    depends_on:
      optimiser:
        condition: service_healthy
    networks:
      - test-network
    restart: unless-stopped
    # No healthcheck currently defined

  # Web Service (Next.js Frontend)
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        # Pass required public variables during build
        - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
        - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
        - NEXT_PUBLIC_NHTSA_API_URL=${NEXT_PUBLIC_NHTSA_API_URL}
    container_name: test_web
    ports:
      - "3000:3000"
    env_file:
      - ./.env.test
    depends_on:
       optimiser:
         condition: service_healthy
       scheduler:
         condition: service_started
    networks:
      - test-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

networks:
  test-network:
    driver: bridge

# No local volumes needed for database
```

### 2. Environment Variable Configuration (`.env.test`) **(Implemented)**

```dotenv
# .env.test (EXAMPLE - Use actual Staging Supabase Credentials/URLs and other required values)

# --- Staging Supabase Config ---
SUPABASE_URL=https://<your-staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<your-staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_staging_supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<your_staging_supabase_service_role_key>

# --- Local Service URLs (Internal Docker Network) ---
OPTIMIZATION_SERVICE_URL=http://optimiser:8080
SCHEDULER_SERVICE_URL=http://scheduler:8080 # Ensure scheduler uses this if needed

# --- API Keys (Use Dummy/Dev keys or real ones if APIs are hit during tests) ---
GOOGLE_MAPS_API_KEY=dummy-google-maps-api-key-for-testing-or-real-key
ONESTEP_GPS_API_KEY=dummy-onestep-gps-api-key-for-testing-or-real-key
NEXT_PUBLIC_NHTSA_API_URL=https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/ # Example URL
# NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (If used directly by web, needs ARG/build.args)

# --- Local Testing Flags ---
BYPASS_OPTIMIZER_AUTH=true

# --- E2E Test Runner Config ---
E2E_BASE_URL=http://localhost:3000
```

### 3. Port Mappings **(Implemented)**

*   `web`: Maps container port `3000` to host port `3000`.
*   `optimiser`: Maps container port `8080` to host port `8081`.

### 4. Networking **(Implemented)**

*   Bridge network `test-network` enables container communication via service names.
*   External access to staging Supabase relies on the host network.

### 5. Data Seeding Strategies for Staging Supabase **(Planning)**

*   **E2E Test-Driven Seeding (Recommended):** Use test suite (e.g., Playwright) setup/teardown hooks via the `web` UI.
*   **Script-Based Seeding (Baseline Data):** Use Node.js/Python scripts with Supabase client library and service role key. Run manually or pre-test.
*   **Cleanup:** Essential. Implement in test teardowns or dedicated scripts.

### 6. Code Adjustments **(Implemented/Verified)**

*   **[x] Scheduler Supabase Client (`apps/scheduler/src/supabase/client.ts`)**: Verified to use `SUPABASE_SERVICE_ROLE_KEY`.
*   **[x] Scheduler Optimizer Call (`apps/scheduler/src/scheduler/optimize.ts`)**: Verified to use `BYPASS_OPTIMIZER_AUTH=true` to skip OIDC.
*   **[x] Web Next.js Config (`apps/web/next.config.ts`)**: Added `output: 'standalone'`.
*   **[x] Optimiser Dockerfile (`apps/optimiser/Dockerfile`)**: Added `RUN apt-get install curl`.
*   **[x] Scheduler `package.json` (`apps/scheduler/package.json`)**: Added `dotenv` to `dependencies`. Updated `pnpm-lock.yaml` by running `pnpm install`.
*   **[x] Web Dockerfile (`apps/web/Dockerfile`)**: Added `ARG` declarations for `NEXT_PUBLIC_` variables. Added `ENTRYPOINT [""]` and switched `CMD` to shell form (`CMD node ...`).
*   **[x] Docker Ignore (`.dockerignore`)**: Added `**/node_modules`.

### 7. Running the Test Environment **(Next Steps)**

1.  **Ensure `.env.test` is present** with correct values.
2.  **Build images & Start services:** `docker-compose -f docker-compose.test.yml up -d --build --force-recreate` *(Completed & Working)*
3.  **Verify Services:** `docker-compose -f docker-compose.test.yml ps` *(All services should be Up/Healthy)*
4.  **(Optional) Run Baseline Seeding Script.**
5.  **Run E2E Tests:** Target `http://localhost:3000`.
6.  **Stop services:** `docker-compose -f docker-compose.test.yml down`.
7.  **Cleanup Staging Data.**

### 8. Documentation Update **(Pending)**

*   Update/create `docs/guides/TESTING.md` with setup instructions for `docker-compose.test.yml` and staging Supabase.
*   Document `.env.test` variables required.
*   Document build arguments needed for `web`.
*   Document `BYPASS_OPTIMIZER_AUTH`.
*   Outline data seeding/cleanup strategies.

### 9. Cleanup Old Simulation Files **(Pending)**

*   Defer removal of `simulation/*` files until the new `docker-compose.test.yml` environment is fully operational and validated.

This updated plan reflects the successful setup of the containerized environment and highlights the key troubleshooting steps taken.
