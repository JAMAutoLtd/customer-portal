# Deployment Documentation

This document outlines the CI/CD deployment process for the backend services within this monorepo using Google Cloud Build and Cloud Run.

## Overview

Deployments for the backend services are automated via Google Cloud Build triggers. Pushing changes to the configured branches in the GitHub repository (`JAMAutoLtd/customer-portal`) automatically initiates a build and deployment process for the respective service.

## Services

### 1. Scheduler Service (`scheduler-node`)

-   **Description**: Node.js service responsible for job scheduling orchestration.
-   **Deployment Trigger**: `deploy-scheduler-node` (Located in `global` region). Triggered by pushes to specific branches (e.g., main/master - verify trigger config).
-   **Cloud Build Config**: `apps/scheduler/cloudbuild.yaml`
-   **Build Context**: `/workspace` (Root of the checkout)
-   **Dockerfile**: `apps/scheduler/Dockerfile`
    -   Uses a multi-stage build pattern.
    -   Installs dependencies using `pnpm` from the workspace root.
    -   Uses `pnpm deploy --filter @jamauto/scheduler --prod --legacy` (or similar workspace command) in the builder stage to prepare production-only `node_modules` for the final stage.
    -   Final stage runs `node dist/server.js`.
-   **Cloud Run Service**: `scheduler-node` (Deployed to `us-west1`)
-   **Service Account (Build Execution)**: Cloud Build executes builds using its service account (`[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`). This account requires the necessary IAM roles (see Permissions section).
    -   *(Historical Note: Previous troubleshooting in `docs/gcp-build-permissions-guide.md` involved the Compute Engine default service account, but standard practice is to grant permissions to the Cloud Build SA).*
-   **Runtime Configuration**:
    -   **Environment Variables** (Set via `--set-env-vars` in `cloudbuild.yaml` using trigger substitutions):
        -   `SUPABASE_URL`: Value provided by `_SUPABASE_URL` substitution variable.
        -   `OPTIMIZATION_SERVICE_URL`: Value provided by `_OPTIMIZATION_SERVICE_URL` substitution variable.
    -   **Secrets** (Mounted via `--update-secrets` in `cloudbuild.yaml`):
        -   `SUPABASE_ANON_KEY`: Pulled from Secret Manager secret `supabase-anon-key` (version `latest`).
        -   `SUPABASE_SERVICE_ROLE_KEY`: Pulled from Secret Manager secret `supabase-service-role-key` (version `latest`). *(Assumed secret name)*
        -   `GOOGLE_MAPS_API_KEY`: Pulled from Secret Manager secret `google-maps-api-key` (version `latest`).
        -   `ONESTEP_GPS_API_KEY`: Pulled from Secret Manager secret `onestep-gps-api-key` (version `latest`). *(Assumed secret name)*

### 2. Optimiser Service (`scheduler-optimize-service`)

-   **Description**: Python (FastAPI) service responsible for route optimization calculations.
-   **Deployment Trigger**: `deploy-optimiser-python` (Located in `global` region). Triggered by pushes to specific branches (verify trigger config).
-   **Cloud Build Config**: `apps/optimiser/cloudbuild.yaml`
-   **Build Context**: `apps/optimiser`
-   **Dockerfile**: `apps/optimiser/Dockerfile`
    -   Standard Python multi-stage build.
    -   Installs dependencies from `requirements.txt` using `pip`.
    -   Runs the application using `uvicorn`.
-   **Cloud Run Service**: `scheduler-optimize-service` (Deployed to `us-west1`)
-   **Service Account (Build Execution)**: Cloud Build executes builds using its service account (`[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`). This account requires the necessary IAM roles.
-   **Runtime Configuration**:
    -   **Environment Variables**: None currently configured via `cloudbuild.yaml`.
    -   **Secrets**: None currently configured via `cloudbuild.yaml`.

### 3. Web Service (`apps/web`)

-   **Description**: Next.js frontend application.
-   **Deployment**: Handled separately via **Vercel**. Not part of the Cloud Build CI/CD pipeline described here.

## Permissions & Secret Management

-   Required secrets (`supabase-anon-key`, `google-maps-api-key`) are stored in Google Secret Manager within the `optimize-service` project.
-   The **Cloud Build Service Account** (`[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`) executing the deployment steps must have the necessary IAM roles granted:
    -   `roles/run.admin`: To deploy and manage Cloud Run services.
    -   `roles/artifactregistry.writer`: To push Docker images to Artifact Registry.
    -   `roles/secretmanager.secretAccessor`: To access secrets needed during deployment (e.g., for `scheduler-node`).
    -   `roles/iam.serviceAccountUser`: May be needed if the Cloud Run service runs as a specific service account (verify service configurations).

## Notes

-   Ensure Cloud Build trigger substitution variables (`_SUPABASE_URL`, `_OPTIMIZATION_SERVICE_URL` for the scheduler trigger) are correctly configured with the appropriate production values in GCP.
-   Verify the specific branches configured for the Cloud Build triggers.
-   Confirm the Cloud Run services (`scheduler-node`, `scheduler-optimize-service`) are configured to run with appropriate service accounts if not using the default Compute Engine SA. 