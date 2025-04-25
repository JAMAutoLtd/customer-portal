
Here's a summary of the key security, permission, identity, and secret management configurations we had to establish:

**1. Organization Policies (GCP):**
   * We encountered and had to **disable** two restrictive Organization Policies to proceed:
      *   **`iam.allowedPolicyMemberDomains` (Domain Restricted Sharing):** This was initially preventing you from granting IAM roles (like Project Owner) to your developer's external Google Account. Disabling it allowed adding users from any domain. *(Security Note: This allows any valid Google account to be added to IAM roles within your org).*
      *   **`iam.disableServiceAccountKeyCreation` (Disable Service Account Key Creation):** This blocked the creation of downloadable JSON keys for service accounts. We needed to disable this to generate a key for the Supabase Edge Function to authenticate to Cloud Run, because the function couldn't access the Google Metadata Server. *(Security Note: Disabling allows key creation; generated keys must be managed securely).*
   * We noted, but did **not** disable, the **`iam.serviceAccountKeyExposureResponse`** policy, relying instead on *not* committing the downloaded key to Git.

**2. GCP Service Accounts:**
   * **Compute Engine Default SA (`...-compute@developer.gserviceaccount.com`):** Due to the project's specific configuration (possibly from initial GUI setups), this account ended up being used by **Cloud Build** and as the default **runtime identity for Cloud Run services**. We had to grant it several permissions typically associated with more specific service accounts.
   * **Cloud Scheduler SA (`cloud-scheduler-invoker@...`):** Created specifically for the Cloud Scheduler job to securely invoke the `scheduler-node` Cloud Run service using OIDC.
   * **Supabase Webhook SA (`supabase-webhook-invoker@...`):** Created specifically for the Supabase Edge Function (`trigger-replan`) to securely invoke the `scheduler-node` Cloud Run service using OIDC (via the service account key method).

**3. GCP IAM Role Bindings:**
   * **Compute Engine Default SA:** Granted the following roles:
      *   `roles/storage.objectViewer` (On the `gs://optimize-service_cloudbuild` bucket, for Cloud Build source access).
      *   `roles/artifactregistry.writer` (On the `optimize-service` Artifact Registry repository, for Cloud Build image push).
      *   `roles/secretmanager.secretAccessor` (On the `optimize-service` project, for Cloud Run service to read secrets).
      *   `roles/logging.logWriter` (On the `optimize-service` project, optional for build logs).
   * **Cloud Scheduler SA:** Granted `roles/run.invoker` on the `scheduler-node` Cloud Run service.
   * **Supabase Webhook SA:** Granted `roles/run.invoker` on the `scheduler-node` Cloud Run service.
   * **Developer Google Account:** Granted `roles/owner` on the `optimize-service` project.

**4. Secret Management:**
   * **GCP Secret Manager:** Created secrets for `supabase-anon-key` and `google-maps-api-key`. These are injected into the `scheduler-node` Cloud Run service via the `--update-secrets` deployment flag.
   * **GCP Service Account Key:** Created and downloaded a JSON key file for the `supabase-webhook-invoker@...` SA (required disabling the Org Policy).
   * **Supabase Edge Function Secrets:** Stored the *entire content* of the downloaded GCP SA JSON key file as a secret named `GCP_SA_KEY_JSON` within the Supabase project's Edge Function secrets manager.

**5. Cloud Run Service Authentication:**
   * Both `scheduler-node` and `scheduler-optimize-service` were configured to **Require authentication** (via `--no-allow-unauthenticated` flag or manually in the console) due to the Org Policy blocking public access.

**6. Trigger Authentication Mechanisms:**
   * **Cloud Scheduler:** Configured the job to use **OIDC authentication**, specifying the `cloud-scheduler-invoker@...` SA and the `scheduler-node` URL as the audience.
   * **Supabase Webhook:** Configured to trigger a **Supabase Edge Function** (`trigger-replan`).
   * **Supabase Edge Function (`trigger-replan`):**
      *   Configured to **NOT enforce JWT verification** (allowing the trigger from the internal webhook).
      *   Code implemented to read the `GCP_SA_KEY_JSON` secret, use `google-auth-library` to generate an OIDC token for the `supabase-webhook-invoker@...` SA (with the `scheduler-node` URL as audience), and make an authenticated call to the `scheduler-node` `/run-replan` endpoint.

This covers the essential identity, permission, secret, and authentication configurations needed beyond the core application code to make this specific cross-platform setup work within your environment's constraints.


# Project-Specific Identifiers & Variables Used

This section summarizes the key names and identifiers specific to this project configuration as established during the initial deployment process documented below.

*   **GCP Project ID:** `optimize-service`
*   **GCP Project Number:** `338117368399`
*   **GCP Region:** `us-west1`
*   **Artifact Registry Repository Name:** `optimize-service`
*   **Cloud Build Source Bucket (Auto-Created):** `gs://optimize-service_cloudbuild`
*   **Compute Engine Default Service Account:** `338117368399-compute@developer.gserviceaccount.com` (Used for Cloud Build and Cloud Run Runtime)
*   **Cloud Build Service Account:** `338117368399@cloudbuild.gserviceaccount.com` (Standard SA, but not used by build process in this case)
*   **Cloud Scheduler Service Account:** `cloud-scheduler-invoker@optimize-service.iam.gserviceaccount.com`
*   **Supabase Webhook/Edge Function Service Account:** `supabase-webhook-invoker@optimize-service.iam.gserviceaccount.com`
*   **Python Cloud Run Service Name:** `scheduler-optimize-service`
*   **Node.js Cloud Run Service Name:** `scheduler-node`
*   **Python Service URL (at time of deployment):** `https://scheduler-optimize-service-vyo5f2aa2a-uw.a.run.app`
*   **Node.js Service URL (at time of deployment):** `https://scheduler-node-vyo5f2aa2a-uw.a.run.app`
*   **Secrets Created:**
    *   `supabase-anon-key`
    *   `google-maps-api-key`

---

# Guide: GCP Permissions for Cloud Build & Deployment

This guide documents the steps and troubleshooting encountered while setting up Google Cloud Platform (GCP) services (Secret Manager, Artifact Registry, Cloud Build) to build container images for the Node.js scheduler and Python optimization services, intended for deployment to Cloud Run.

## 1. Goal & Concepts

*   **Goal:** Build Docker images for `scheduler-node` and `optimize-service-python` and push them to Artifact Registry using Cloud Build. Store sensitive API keys in Secret Manager.
*   **Key Services:**
    *   **Cloud Build:** Builds Docker images based on source code and a `Dockerfile`.
    *   **Artifact Registry:** Stores container images (and other artifacts). Needs a repository created (e.g., `optimize-service` in `us-west1`).
    *   **Secret Manager:** Securely stores API keys and other secrets.
    *   **Cloud Run:** Runs containerized applications.
*   **Key Identifiers:**
    *   **Project ID:** The unique identifier for your GCP project (e.g., `optimize-service`).
    *   **Region:** The geographic location for resources (e.g., `us-west1`). Set a default using `gcloud config set compute/region [YOUR_REGION]`.
*   **Service Accounts:** Identities used by GCP services to interact with other services. We encountered two important ones:
    *   **Cloud Build SA:** `[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`. Typically used by Cloud Build. *Requires `roles/cloudbuild.builds.builder` for basic build operations.*
    *   **Compute Engine Default SA:** `[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`. Used by Compute Engine VMs by default. **Crucially, in this specific project setup (possibly due to initial GUI deployments), Cloud Build operations ended up running as this service account.**

## 2. Initial Setup Steps

1.  **Confirm Project ID & Region:** Use `gcloud config list` or the GCP Console.
2.  **Create Secrets:** Use `gcloud secrets create ...` to store `SUPABASE_ANON_KEY` and `GOOGLE_MAPS_API_KEY`.
3.  **Create Artifact Registry Repo:** Use `gcloud artifacts repositories create ...` if one doesn't exist.
4.  **Build Source Code:** Run `npm run build` locally for the Node.js service to create the `dist/` directory.
5.  **Submit Builds:** Use `gcloud builds submit ...` for both services.

## 3. Troubleshooting & Permissions

We encountered several permission-related issues, primarily because Cloud Build operations were unexpectedly using the **Compute Engine Default Service Account** instead of the dedicated Cloud Build Service Account.

Here's a summary of the issues and fixes:

1.  **API Not Enabled:**
    *   **Symptom:** `gcloud` commands fail, prompting `API [servicename] not enabled... Would you like to enable and retry? (y/N)?`
    *   **Fix:** Enter `y` to enable the required API (e.g., `secretmanager.googleapis.com`, `cloudbuild.googleapis.com`). Wait a minute for enablement.

2.  **Secret Creation/Access Fails:**
    *   **Symptom:** `gcloud secrets create` or `gcloud secrets add-iam-policy-binding` fails with `Secret not found` or similar, *even after enabling the API*.
    *   **Reason:** The API enablement might have happened *after* the initial creation attempt failed silently.
    *   **Fix:** Rerun the `gcloud secrets create` command *after* confirming the API is enabled.

3.  **Build Fails: Cannot Access Source Code (403 Error):**
    *   **Symptom:** `gcloud builds submit` fails with `googleapi: Error 403: [SERVICE_ACCOUNT] does not have storage.objects.get access to the Google Cloud Storage object gs://[PROJECT_ID]_cloudbuild/source/...`. The `SERVICE_ACCOUNT` mentioned was the Compute Engine SA (`...-compute@developer.gserviceaccount.com`).
    *   **Reason:** The service account running the build needs permission to read the source code uploaded to the temporary Cloud Storage bucket.
    *   **Fix:** Grant the specific service account mentioned in the error (`...-compute@developer.gserviceaccount.com`) the `Storage Object Viewer` role (`roles/storage.objectViewer`) *directly on the source bucket*:
        ```powershell
        $env:COMPUTE_ENGINE_SA = "[PROJECT_NUMBER]-compute@developer.gserviceaccount.com"
        $env:SOURCE_BUCKET = "[PROJECT_ID]_cloudbuild"
        gsutil iam ch "serviceAccount:$($env:COMPUTE_ENGINE_SA):roles/storage.objectViewer" "gs://$($env:SOURCE_BUCKET)"
        ```
    *   **Wait:** Allow ~60 seconds for permissions to propagate before retrying the build.

4.  **Build Fails: Cannot Push Image (403 Error):**
    *   **Symptom:** Build step succeeds, but the PUSH step fails with `denied: Permission "artifactregistry.repositories.uploadArtifacts" denied on resource "projects/.../repositories/[REPO_NAME]"`. The error again implicitly points to the Compute Engine SA.
    *   **Reason:** The service account running the build needs permission to write (upload) artifacts to the target Artifact Registry repository.
    *   **Fix:** Grant the Compute Engine SA (`...-compute@developer.gserviceaccount.com`) the `Artifact Registry Writer` role (`roles/artifactregistry.writer`) *on the specific repository*:
        ```powershell
        $env:COMPUTE_ENGINE_SA = "[PROJECT_NUMBER]-compute@developer.gserviceaccount.com"
        $env:AR_REPO_NAME = "[YOUR_REPO_NAME]" # e.g., optimize-service
        $env:REGION = "[YOUR_REGION]" # e.g., us-west1
        $env:PROJECT_ID = "[YOUR_PROJECT_ID]" # e.g., optimize-service
        gcloud artifacts repositories add-iam-policy-binding $env:AR_REPO_NAME `
          --location=$env:REGION `
          --project=$env:PROJECT_ID `
          --member="serviceAccount:$($env:COMPUTE_ENGINE_SA)" `
          --role="roles/artifactregistry.writer"
        ```
    *   **Wait:** Allow ~60 seconds for permissions to propagate before retrying the build.

5.  **Build Fails: `Dockerfile` Not Found:**
    *   **Symptom:** Build fails immediately with `unable to evaluate symlinks in Dockerfile path: lstat /workspace/Dockerfile: no such file or directory`.
    *   **Reason:** The root `.dockerignore` file contained `Dockerfile*`, excluding the Dockerfile from the build context.
    *   **Fix:** Edit `.dockerignore` and remove or comment out the `Dockerfile*` line.

6.  **Build Succeeds but INFO: Missing Logging Permission:**
    *   **Symptom:** Build works, but an INFO message appears: `The service account running this build ... does not have permission to write logs... grant the Logs Writer (roles/logging.logWriter) role...`
    *   **Reason:** The service account lacks permission to write detailed build logs to Cloud Logging.
    *   **Fix (Optional but Recommended):** Grant the Compute Engine SA (`...-compute@developer.gserviceaccount.com`) the `Logs Writer` role at the project level:
        ```powershell
        $env:COMPUTE_ENGINE_SA = "[PROJECT_NUMBER]-compute@developer.gserviceaccount.com"
        $env:PROJECT_ID = "[YOUR_PROJECT_ID]"
        gcloud projects add-iam-policy-binding $env:PROJECT_ID `
          --member="serviceAccount:$($env:COMPUTE_ENGINE_SA)" `
          --role="roles/logging.logWriter"
        ```

## 4. Summary of Required Permissions (Compute Engine SA)

In this specific project, the Compute Engine Default Service Account (`[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`) required the following roles for `gcloud builds submit` to succeed:

*   `roles/storage.objectViewer` (Granted on the `gs://[PROJECT_ID]_cloudbuild` bucket)
*   `roles/artifactregistry.writer` (Granted on the `projects/[PROJECT_ID]/locations/[REGION]/repositories/[REPO_NAME]` Artifact Registry repository)
*   `roles/logging.logWriter` (Granted on the `projects/[PROJECT_ID]` - Optional for logging)

**Note:** This reliance on the Compute Engine SA might be specific to this project's history (e.g., initial deployments via GUI). In many standard setups, granting the *Cloud Build Service Account* (`[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`) the `roles/cloudbuild.builds.builder` role at the project level is sufficient.

## 5. Deploying Services to Cloud Run (Authenticated)

After successfully building and pushing the container images to Artifact Registry, the next phase involved deploying the services to Cloud Run and setting up the Cloud Scheduler trigger. Due to an active Organization Policy (`constraints/iam.allowedPolicyMemberDomains`) preventing public access (`allUsers`), all deployments had to be configured to require authentication.

1.  **Deploy Python Service (`scheduler-optimize-service`):**
    *   Used `gcloud run deploy ... --allow-unauthenticated`.
    *   Deployment completed but warned about failing to set the IAM policy for `allUsers` due to the Org Policy.
    *   **Action:** Manually edited the `scheduler-optimize-service` in the Cloud Console -> Security tab -> Authentication section, selecting **"Require authentication"**.

2.  **Deploy Node.js Service (`scheduler-node`):**
    *   Used `gcloud run deploy ... --no-allow-unauthenticated` (explicitly requiring authentication).
    *   **Troubleshooting:** Deployment initially failed because the runtime service account (defaulting to the Compute Engine SA: `[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`) lacked permission to access the secrets specified via `--update-secrets`.
    *   **Fix:** Granted the Compute Engine SA (`...-compute@developer.gserviceaccount.com`) the `Secret Manager Secret Accessor` role (`roles/secretmanager.secretAccessor`) at the project level:
        ```powershell
        $env:COMPUTE_ENGINE_SA = "[PROJECT_NUMBER]-compute@developer.gserviceaccount.com"
        $env:PROJECT_ID = "[YOUR_PROJECT_ID]"
        gcloud projects add-iam-policy-binding $env:PROJECT_ID `
          --member="serviceAccount:$($env:COMPUTE_ENGINE_SA)" `
          --role="roles/secretmanager.secretAccessor"
        ```
    *   **Wait & Retry:** After waiting ~60 seconds for IAM propagation, the `gcloud run deploy` command for `scheduler-node` succeeded.

3.  **Configure Authenticated Triggers:**
    *   **Goal:** Allow both periodic checks (Cloud Scheduler) and immediate replans on new orders (Supabase Webhook -> Edge Function) to securely call the `/run-replan` endpoint on the `scheduler-node` service.
    *   **A. Cloud Scheduler Trigger:**
        *   **Create Scheduler SA:** Created `cloud-scheduler-invoker@...`.
        *   **Grant Invoker Role:** Granted this SA the `roles/run.invoker` role on `scheduler-node`.
        *   **Create Scheduler Job:** Created the `trigger-daily-replan` job using OIDC authentication with this SA and the `scheduler-node` URL as the audience.
    *   **B. Supabase New Order Trigger:**
        *   **Create Webhook SA:** Created `supabase-webhook-invoker@...`.
        *   **Grant Invoker Role:** Granted this SA the `roles/run.invoker` role on `scheduler-node`.
        *   **Create Supabase Edge Function (`trigger-replan`):** Deployed an Edge Function whose purpose is to obtain a Google OIDC token for the `supabase-webhook-invoker` SA (using the `scheduler-node` URL as audience) and then make an authenticated `POST` request to the `scheduler-node`'s `/run-replan` endpoint.
        *   **Create Supabase Database Webhook:** Configured a webhook on the `orders` table (`INSERT` event) to invoke the `trigger-replan` Edge Function.

## 6. Verification

*   **Cloud Scheduler Trigger:** Manually triggered the `trigger-daily-replan` Cloud Scheduler job.
    *   Confirmed Cloud Scheduler logs showed successful `AttemptStarted` and `AttemptFinished`.
    *   Checked Cloud Run logs for `scheduler-node` for successful processing initiated by the scheduler trigger.
*   **Supabase Trigger:**
    *   Manually inserted a new row into the `orders` table in Supabase.
    *   Checked Supabase Edge Function logs (`trigger-replan`) for successful execution, including fetching the OIDC token and calling Cloud Run.
    *   Checked Cloud Run logs for `scheduler-node` for successful processing initiated by the Edge Function trigger.
*   **Application Logic:** Observed expected application behavior in `scheduler-node` logs based on database state (e.g., fetching data, potentially calling optimizer, logging completion).
*   **Errors:** No infrastructure errors related to permissions or triggering were observed for either mechanism.

**Conclusion:** The end-to-end deployment, including authenticated triggering via Cloud Scheduler (periodic) and Supabase Webhook/Edge Function (on new orders), is operational. Further testing requires populating the database with valid job and technician data.

---

## 7. Pattern: Adding New Supabase-Triggered Cloud Run Calls (via Edge Functions)

The setup described in section 5.B (Supabase New Order Trigger) uses a Supabase Edge Function as an intermediary because Supabase Database Webhooks (as configured via the UI) cannot directly generate the necessary Google OIDC tokens to call authenticated Cloud Run services. This pattern can be reused for other database events that need to trigger secure actions on Cloud Run.

**General Steps:**

1.  **Define Trigger and Action:**
    *   Identify the database event (e.g., `INSERT` on `table_x`, `UPDATE` on `table_y`).
    *   Define the specific Cloud Run endpoint (e.g., `/do-action-x` on `scheduler-node` or even a different Cloud Run service) that should be called.

2.  **Service Account (GCP):**
    *   Decide if the existing service account used for Supabase triggers (`supabase-webhook-invoker@...`) has the appropriate identity and permissions for this new action.
    *   If the new trigger requires different permissions or represents a distinctly different function, **create a new dedicated Service Account** in GCP IAM (e.g., `edge-function-action-x-invoker@...`).

3.  **Grant IAM Permissions (GCP):**
    *   Grant the chosen Service Account (either existing or new) the necessary IAM role to call the target Cloud Run service/endpoint. Typically, this is the `Cloud Run Invoker` role (`roles/run.invoker`) granted **on the specific Cloud Run service** that will be called.
        ```powershell
        # Example granting invoker role to a NEW SA on scheduler-node
        $env:NEW_SA_EMAIL = "edge-function-action-x-invoker@[PROJECT_ID].iam.gserviceaccount.com"
        gcloud run services add-iam-policy-binding scheduler-node `
          --project=[PROJECT_ID] `
          --region=[REGION] `
          --member="serviceAccount:$($env:NEW_SA_EMAIL)" `
          --role="roles/run.invoker"
        ```
    *   **Wait:** Remember to allow ~60 seconds for IAM propagation after creating a new SA or granting permissions.

4.  **Create Supabase Edge Function:**
    *   Create a new Edge Function in your Supabase project (e.g., name it `handle-action-x`).
    *   **Code Logic:**
        *   Import necessary Deno/Supabase libraries.
        *   Define constants for the target `CLOUD_RUN_URL` (the specific endpoint for this action) and the `INVOKER_SERVICE_ACCOUNT_EMAIL` (the SA you chose/created in step 2).
        *   Set the `OIDC_TOKEN_AUDIENCE` to the **base URL** of the target Cloud Run service.
        *   Include the logic to fetch the Google OIDC token using the correct service account email and audience (similar to the `trigger-replan` function's code, using `fetch` with `Metadata-Flavor: Google`).
        *   Make the authenticated `fetch` call (e.g., `POST`, `GET`) to the target Cloud Run endpoint, including the `Authorization: Bearer <token>` header.
        *   Handle success and error responses appropriately.
    *   Deploy the function.

5.  **Create Supabase Database Webhook:**
    *   Create a new Database Webhook in Supabase.
    *   Configure it to listen for the specific **Table** and **Event(s)** defined in step 1.
    *   Set the trigger type to **"Supabase Edge Functions"**.
    *   Select the **new Edge Function** (e.g., `handle-action-x`) you created in step 4.
    *   Save the webhook.

By following this pattern, you can securely trigger different authenticated Cloud Run endpoints based on various database events using Supabase Edge Functions as the authenticated intermediary.

---

# Standard Update Workflow (After Initial Setup)

Once the initial permissions and configurations documented below are in place, updating the deployed services typically follows these steps:

1.  **Make Code Changes:** Modify the source code for either the Node.js service (`src/`) or the Python service (`optimize-service/`), or both.

2.  **Build Node.js (if changed):** If you modified the Node.js code, run the local build command from the project root (`scheduler-py`):
    ```powershell
    npm run build
    ```

3.  **Submit Builds to Cloud Build:**
    *   **If Node.js changed:** Run the Node.js build submission from the project root:
        ```powershell
        gcloud builds submit . `
          --project=optimize-service `
          --tag "us-west1-docker.pkg.dev/optimize-service/optimize-service/scheduler-node:latest" `
          --ignore-file=.dockerignore
        ```
    *   **If Python changed:** Run the Python build submission from the project root:
        ```powershell
        gcloud builds submit optimize-service `
          --project=optimize-service `
          --tag "us-west1-docker.pkg.dev/optimize-service/optimize-service/optimize-service-python:latest"
        ```
    *(You only need to rebuild the service(s) that changed).*

4.  **Deploy Updates to Cloud Run:**
    *   **If Python changed:** Deploy the updated Python service image:
        ```powershell
        gcloud run deploy scheduler-optimize-service `
          --project=optimize-service `
          --region=us-west1 `
          --image="us-west1-docker.pkg.dev/optimize-service/optimize-service/optimize-service-python:latest" `
          --platform=managed # Add other flags like --cpu, --memory if needed, but usually only image is required for updates
        ```
    *   **If Node.js changed:** Deploy the updated Node.js service image (note: it pulls the latest secrets and env vars automatically):
        ```powershell
        gcloud run deploy scheduler-node `
          --project=optimize-service `
          --region=us-west1 `
          --image="us-west1-docker.pkg.dev/optimize-service/optimize-service/scheduler-node:latest" `
          --platform=managed # Add other flags if needed
        ```
    *(Again, you only need to deploy the service(s) whose image was updated. Cloud Run will create a new revision with the updated image).*

**Important Notes:**

*   You should **not** need to repeat the permission-granting steps (using `add-iam-policy-binding` or `gsutil iam ch`) during routine updates. Those were one-time setup tasks.
*   The deployment commands (`gcloud run deploy`) automatically pick up existing environment variables and secret configurations unless you explicitly override them. You usually only need to specify the new `--image`.
*   Consider using more specific image tags (e.g., based on Git commit hashes) instead of just `:latest` for better version control and rollback capabilities in production environments. This guide uses `:latest` for simplicity, matching the initial setup. 


```
#POWERSHELL SCRIPT NODE

# 1. Build Node.js Source
npm run build

# 2. Build Node.js Docker Image using Cloud Build
gcloud builds submit . `
  --project=optimize-service `
  --tag "us-west1-docker.pkg.dev/optimize-service/optimize-service/scheduler-node:latest" `
  --ignore-file=.dockerignore

# 3. Deploy Updated Node.js Service to Cloud Run
# (Using direct command string method which worked reliably before)
$env:PROJECT_ID="optimize-service"
$env:REGION="us-west1"
$env:NODE_SERVICE_NAME="scheduler-node"
$env:NODE_IMAGE_URI="us-west1-docker.pkg.dev/$($env:PROJECT_ID)/optimize-service/scheduler-node:latest"
$env:NODE_SECRETS="SUPABASE_ANON_KEY=supabase-anon-key:latest,GOOGLE_MAPS_API_KEY=google-maps-api-key:latest"
$env:SUPABASE_URL_VALUE="https://rpwazhpyylwqfbxcwtsy.supabase.co/"
# Ensure Optimize Service URL is set
# $env:OPTIMIZE_SERVICE_URL="https://scheduler-optimize-service-vyo5f2aa2a-uw.a.run.app" # Manual set if needed
if (-not $env:OPTIMIZE_SERVICE_URL) { Write-Error "OPTIMIZE_SERVICE_URL missing"; exit }

Write-Host "Deploying updated $($env:NODE_SERVICE_NAME) with service-to-service auth..."

gcloud run deploy $env:NODE_SERVICE_NAME `
  --project=$env:PROJECT_ID `
  --region=$env:REGION `
  --image=$env:NODE_IMAGE_URI `
  --platform=managed `
  --port=8080 `
  --no-allow-unauthenticated `
  --min-instances=0 `
  --max-instances=2 `
  --cpu=1 `
  --memory=512Mi `
  --update-secrets=$env:NODE_SECRETS `
  --set-env-vars="OPTIMIZATION_SERVICE_URL=$($env:OPTIMIZE_SERVICE_URL),SUPABASE_URL=$($env:SUPABASE_URL_VALUE)"

if ($LASTEXITCODE -ne 0) { Write-Error "Deployment failed." } else { Write-Host "Deployment successful." }
```


```
# POWERSHELL SCRIPT PYTHON

# --- Set Variables ---
$env:PROJECT_ID="optimize-service"
$env:REGION="us-west1"
$env:AR_REPO_NAME="optimize-service" # Your Artifact Registry Repo Name
$env:PYTHON_SERVICE_NAME="scheduler-optimize-service" # Cloud Run service name
$env:PYTHON_IMAGE_URI="us-west1-docker.pkg.dev/$($env:PROJECT_ID)/$($env:AR_REPO_NAME)/optimize-service-python:latest"
# --- End Variables ---

# 1. Build Python Docker Image using Cloud Build
Write-Host "Building Python service image..."
gcloud builds submit optimize-service `
  --project=$env:PROJECT_ID `
  --tag $env:PYTHON_IMAGE_URI

if ($LASTEXITCODE -ne 0) {
    Write-Error "Python service build failed."
    exit # Stop if build fails
} else {
    Write-Host "Python service build successful."
}

# 2. Deploy Updated Python Service to Cloud Run
Write-Host "Deploying updated Python service $($env:PYTHON_SERVICE_NAME)..."

gcloud run deploy $env:PYTHON_SERVICE_NAME `
  --project=$env:PROJECT_ID `
  --region=$env:REGION `
  --image=$env:PYTHON_IMAGE_URI `
  --platform=managed `
  # Add other flags like --cpu, --memory, --min-instances, --max-instances if you need to change them
  # Example: --cpu=1 --memory=512Mi --max-instances=5
  --port=8080 # Ensure port is specified if not default

if ($LASTEXITCODE -ne 0) {
    Write-Error "Python service deployment failed."
} else {
    Write-Host "Python service deployment successful."
    # Optionally retrieve and display the URL again
    # Start-Sleep -Seconds 5
    # $env:OPTIMIZE_SERVICE_URL=$(gcloud run services describe $env:PYTHON_SERVICE_NAME --project=$env:PROJECT_ID --region=$env:REGION --platform=managed --format='value(status.url)' 2>$null)
    # Write-Host "Python Service URL: $($env:OPTIMIZE_SERVICE_URL)"
}
```