# Information for Frontend Development

This document provides the necessary connection details and context for integrating the frontend application with the scheduler backend system.

## Primary Data Interaction: Supabase

The frontend application will primarily interact directly with the **Supabase database** to fetch and display data related to jobs, technicians, schedules, customer information, etc., **and to create new orders**.

**Connection Details:**

*   **Supabase URL:** `https://rpwazhpyylwqfbxcwtsy.supabase.co/`
*   **Supabase Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwd2F6aHB5eWx3cWZieGN3dHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExMjE0ODMsImV4cCI6MjA1NjY5NzQ4M30.J_ouESWmyjSqSrQJctIoBRSlMu_j03uBWTKSXrp_Rgs`

**Important:** Ensure all data access and order creation from the frontend respects the configured Supabase Row Level Security (RLS) policies. The anon key should only grant access/permissions appropriate for the frontend user role.

## Backend Services & Triggering (Context / Background Info)

There are two backend microservices deployed on Google Cloud Run that handle the scheduling logic. The frontend application **does not need to call these services directly.**

*   **Node.js Scheduler Service (`scheduler-node`):**
    *   URL: `https://scheduler-node-vyo5f2aa2a-uw.a.run.app`
    *   Purpose: Orchestrates the scheduling process.
    *   **Triggers:**
        *   **On New Order:** When the frontend creates a new order in the Supabase `orders` table, a Supabase Database Webhook automatically triggers a **Supabase Edge Function (`trigger-replan`)**. This Edge Function then makes an authenticated call to the Node.js service's `/run-replan` endpoint to initiate scheduling.
        *   **Periodic:** A Google Cloud Scheduler job also triggers the `/run-replan` endpoint periodically (e.g., daily) as a fallback or for regular checks.

*   **Python Optimization Service (`scheduler-optimize-service`):**
    *   URL: `https://scheduler-optimize-service-vyo5f2aa2a-uw.a.run.app`
    *   Purpose: Performs route optimization.
    *   Trigger: Called **only** internally by the `scheduler-node` service when needed.

**Authentication Note:** Both backend Cloud Run services require Google Cloud IAM authentication. This is handled automatically by the Cloud Scheduler job and the Supabase Edge Function when they trigger the Node.js service.

**Note on Trigger Mechanism (Internal Detail):** The trigger for new orders uses a Supabase Database Webhook that calls a Supabase Edge Function (`trigger-replan`). This Edge Function is responsible for getting the necessary Google authentication token and securely calling the `scheduler-node` Cloud Run service. This pattern (Database Event -> Edge Function -> Authenticated Cloud Run Call) may be used for other automatic triggers added in the future.

## Future API Needs (Discussion Point)

Please consider if there are specific data aggregations, actions (other than creating an order), or views that cannot be efficiently or securely handled by direct Supabase queries from the frontend.

If such requirements exist (e.g., fetching a heavily processed data view, triggering a *different* specific backend action), we may need to add dedicated, authenticated API endpoints to the `scheduler-node` service in the future to support the frontend. Let's discuss any potential needs. 