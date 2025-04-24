# Deployment Documentation

This document outlines the CI/CD deployment process for the backend services within this monorepo using Google Cloud Build and Cloud Run.

## Overview

Deployments for the backend services are automated via Google Cloud Build triggers. Pushing changes to the configured branches in the GitHub repository (`JAMAutoLtd/customer-portal`) automatically initiates a build and deployment process for the respective service.

## Services

### 1. Scheduler Service (`scheduler-node`)

-   **Description**: Node.js service responsible for job scheduling orchestration.
-   **Deployment Trigger**: `deploy-scheduler-node` (Located in `global` region). Triggered by pushes to specific branches (e.g., main/master - verify trigger config).
-   **Cloud Build Config**: `apps/scheduler/cloudbuild.yaml`
-   **Dockerfile**: `apps/scheduler/Dockerfile`
    -   Uses a multi-stage build pattern.
    -   Installs dependencies using `pnpm`.
    -   Uses `pnpm deploy --prod --legacy` in the builder stage to prepare production-only `node_modules` for the final stage. This is necessary due to pnpm v10+ workspace behavior.
    -   Final stage runs `node dist/server.js`.
-   **Cloud Run Service**: `scheduler-node` (Deployed to `us-west1`)
-   **Service Account (Build)**: The trigger is configured to use the **Compute Engine default service account** (`338117368399-compute@developer.gserviceaccount.com`) to execute the build steps.
-   **Runtime Configuration**:
    -   **Environment Variables** (Set via `--set-env-vars` in `cloudbuild.yaml` using trigger substitutions):
        -   `SUPABASE_URL`: Value provided by `_SUPABASE_URL` substitution variable.
        -   `OPTIMIZATION_SERVICE_URL`: Value provided by `_OPTIMIZATION_SERVICE_URL` substitution variable.
    -   **Secrets** (Mounted via `--update-secrets` in `cloudbuild.yaml`):
        -   `SUPABASE_ANON_KEY`: Pulled from Secret Manager secret `supabase-anon-key` (version `latest`).
        -   `GOOGLE_MAPS_API_KEY`: Pulled from Secret Manager secret `google-maps-api-key` (version `latest`).
-   **Required Permissions**: The Compute Engine service account (`338117368399-compute@developer.gserviceaccount.com`) requires the `Secret Manager Secret Accessor` role to access the secrets during deployment.

### 2. Optimiser Service (`scheduler-optimize-service`)

-   **Description**: Python (FastAPI) service responsible for route optimization calculations.
-   **Deployment Trigger**: Assumed to be similar to the scheduler (e.g., `deploy-optimiser-python` in `global` region, triggered by pushes). *Verification needed.*
-   **Cloud Build Config**: `apps/optimiser/cloudbuild.yaml`
-   **Dockerfile**: `apps/optimiser/Dockerfile`
    -   Standard Python multi-stage build.
    -   Installs dependencies from `requirements.txt` using `pip`.
    -   Runs the application using `uvicorn`.
-   **Cloud Run Service**: `scheduler-optimize-service` (Deployed to `us-west1`)
-   **Service Account (Build)**: Assumed to be the **Compute Engine default service account** (`338117368399-compute@developer.gserviceaccount.com`) for consistency. *Verification needed in trigger configuration.*
-   **Runtime Configuration**:
    -   **Environment Variables**: None currently configured via `cloudbuild.yaml`. Add via `--set-env-vars` if needed.
    -   **Secrets**: None currently configured via `cloudbuild.yaml`. Add via `--update-secrets` if needed.
-   **Required Permissions**: If secrets are added, the build service account will need the `Secret Manager Secret Accessor` role for those secrets.

### 3. Web Service (`apps/web`)

-   **Description**: Next.js frontend application.
-   **Deployment**: Handled separately via **Vercel**. Not part of the Cloud Build CI/CD pipeline described here.

## Secret Management

-   Required secrets (`supabase-anon-key`, `google-maps-api-key`) are stored in Google Secret Manager within the `optimize-service` project.
-   The service account executing the Cloud Build deployment steps (currently `338117368399-compute@developer.gserviceaccount.com`) must have the `Secret Manager Secret Accessor` role granted for these secrets.

## Notes

-   Ensure Cloud Build trigger substitution variables (`_SUPABASE_URL`, `_OPTIMIZATION_SERVICE_URL`) are correctly configured with the appropriate values.
-   Verify the specific branches configured for the Cloud Build triggers.
-   Verify the service account used by the `optimiser` Cloud Build trigger. 