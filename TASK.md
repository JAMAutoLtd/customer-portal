# Task List: Backend CI/CD Setup (Cloud Build)

This document outlines the steps to configure Google Cloud Build triggers for automatically building and deploying the `scheduler` (Node.js) and `optimiser` (Python) backend services based on changes in the `JAMAutoLtd/customer-portal` monorepo.

**References:**
*   `MONOREPO_PLAN.md` (Phase 5)
*   `docs/gcp-build-permissions-guide.md` (Successful manual build/deploy patterns)

**Key Considerations:**
*   **Artifact Registry:** Images pushed to `us-west1-docker.pkg.dev/optimize-service/optimize-service/`.
*   **Cloud Run Services:** Deploy to `scheduler-node` and `scheduler-optimize-service` in `us-west1`.
*   **Secrets:** `scheduler-node` requires `supabase-anon-key` and `google-maps-api-key`.
*   **Environment Variables:** `scheduler-node` needs `OPTIMIZATION_SERVICE_URL` and `SUPABASE_URL` (managed via substitutions in `cloudbuild.yaml`).
*   **Authentication:** Cloud Run services configured with `--no-allow-unauthenticated`.
*   **Permissions:** Cloud Build Service Account (`[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`) requires necessary IAM roles (e.g., Artifact Registry Writer, Cloud Run Admin, Secret Manager Secret Accessor).
*   **Image Tagging:** Use `$COMMIT_SHA` and `latest` tags.
*   **Build Context:** Triggers will use the respective application directory (`apps/scheduler` or `apps/optimiser`) as the build context.

**Tasks:**

1.  [x] Create `apps/scheduler/cloudbuild.yaml` for the Node.js service, including steps for `pnpm` install/build, Docker build/push, and Cloud Run deployment.
2.  [x] Create `apps/optimiser/cloudbuild.yaml` for the Python service, including steps for Docker build/push and Cloud Run deployment.
3.  [x] Verify Cloud Build Service Account Permissions in GCP (`optimize-service` project) to ensure it has the required roles:
    *   `roles/artifactregistry.writer` (on the repository) - Granted
    *   `roles/run.admin` (on the project or specific services - simpler for admin) - Granted
    *   `roles/secretmanager.secretAccessor` (on the project or specific secrets) - Granted
    *   `roles/iam.serviceAccountUser` (potentially needed for Cloud Run deployment if using a custom runtime service account, but likely covered by `run.admin` if deploying *as* the Cloud Build SA).
4.  [x] Create Cloud Build Trigger for `scheduler` in GCP:
    *   Name: e.g., `deploy-scheduler-node`
    *   Event: Push to branch (e.g., `main`)
    *   Source Repository: `JAMAutoLtd/customer-portal`
    *   Included Files Filter: `apps/scheduler/**`
    *   Configuration: Cloud Build configuration file (`apps/scheduler/cloudbuild.yaml`)
    *   Substitution Variables: Define `_OPTIMIZATION_SERVICE_URL` and `_SUPABASE_URL` (or ensure defaults in YAML are correct).
5.  [x] Create Cloud Build Trigger for `optimiser` in GCP:
    *   Name: e.g., `deploy-optimiser-python`
    *   Event: Push to branch (e.g., `main`)
    *   Source Repository: `JAMAutoLtd/customer-portal`
    *   Included Files Filter: `apps/optimiser/**`
    *   Configuration: Cloud Build configuration file (`apps/optimiser/cloudbuild.yaml`)
6.  [ ] Test triggers by pushing changes to the respective app directories.
7.  [ ] Document the trigger setup and any necessary permission adjustments. 


# Below are the notes that build the task list above

We will create two separate Cloud Build triggers in your GCP project (`optimize-service`). Each trigger will:
1.  Watch for changes in a specific application's directory (`apps/scheduler/**` or `apps/optimiser/**`) within your connected GitHub repository (`JAMAutoLtd/customer-portal`).
2.  Execute the build and deployment steps defined in a `cloudbuild.yaml` file located within that application's directory (`apps/scheduler/cloudbuild.yaml` or `apps/optimiser/cloudbuild.yaml`).
3.  Use the respective application directory as the build context.

This aligns with the monorepo CI/CD plan from `MONOREPO_PLAN.md`.

**Key Considerations from `gcp-build-permissions-guide.md`:**

*   **Artifact Registry:** Images will be pushed to `us-west1-docker.pkg.dev/optimize-service/optimize-service/`.
*   **Cloud Run Services:** We'll deploy to `scheduler-node` and `scheduler-optimize-service` in `us-west1`.
*   **Secrets:** `scheduler-node` requires `supabase-anon-key` and `google-maps-api-key` from Secret Manager.
*   **Environment Variables:** `scheduler-node` needs `OPTIMIZATION_SERVICE_URL` and `SUPABASE_URL`. We'll need to ensure `OPTIMIZATION_SERVICE_URL` is correctly set or passed during deployment (perhaps using substitutions or fetching it).
*   **Authentication:** Both services should require authentication (`--no-allow-unauthenticated`).
*   **Permissions:** The **Cloud Build Service Account** (`[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`) will need the necessary IAM roles (like `roles/artifactregistry.writer`, `roles/run.admin` or `roles/run.invoker` + `roles/iam.serviceAccountUser`, `roles/secretmanager.secretAccessor`) as detailed previously. This differs slightly from the guide which noted the Compute Engine SA was used, but granting roles to the Cloud Build SA is the standard and recommended practice.
