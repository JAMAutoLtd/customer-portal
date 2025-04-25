# E2E Testing Plan: Argument-Driven Scenarios

This document outlines the End-to-End (E2E) testing strategy for the dynamic job scheduler, focusing on the transition from purely randomized testing to deterministic, argument-driven test scenarios.

## Original Goal (from Initial Request)

"Consider how we will rebuild the generation and use of metadata to accomplish a new way of testing, using arguments to force certain test conditions, e.g.
-scheduling starts on today but the next 2 days are not work days
-a bundle is created but two different technicians possess the tools for the two jobs
-a job exists that we don't possess the equipment for
-a job with a fixed schedule time within the loop period exists
- any other useful cases you can think of"

## Implemented Refactoring Strategy

The E2E test suite has been refactored to use a deterministic, argument-driven approach:

1.  **Test Runner (`SIMULATION/run-e2e-tests.js`)**: Accepts a `--scenario=<scenario_name>` argument.
2.  **Seed Data Generator (`SIMULATION/generate-dynamic-seed.js`)**:
    *   Receives the `--scenario` argument from the runner.
    *   Contains specific logic to *force* the conditions required for the named scenario (e.g., creating specific jobs, assigning equipment deterministically, generating exceptions).
    *   Generates the necessary SQL data (`SIMULATION/init-scripts/07-generated-seed-data.sql`) reflecting the forced scenario.
    *   Generates a minimal `SIMULATION/seed-metadata.json` file containing only the IDs of the key entities (jobs, orders, addresses, technicians) relevant to verifying the *specific* forced scenario.
3.  **Test Suite (`tests/e2e/e2e.test.ts`)**:
    *   Reads the `SIMULATION/seed-metadata.json` file in a `beforeAll` block.
    *   Uses a `switch` statement based on the `scenario` name read from the metadata.
    *   Executes targeted assertions for each scenario, using the specific IDs loaded from the metadata to dynamically identify the relevant jobs/orders/etc. This eliminates reliance on hardcoded IDs (like 1, 2) or fragile assumptions about data generation.

## Implemented E2E Test Scenarios

The following scenarios are implemented and can be run using `node SIMULATION/run-e2e-tests.js --generate --scenario=<scenario_name>`:

*   **Scenario: `missing-equipment`**
    *   **Purpose:** Verify that a job requiring specific equipment (forced to be 'prog') that no technician's van possesses ends up in `pending_review`.
    *   **Generator Logic:** Creates a job linked to a service requiring 'prog' equipment. Ensures no van in `van_equipment` is assigned the 'prog' equipment ID. Stores the generated job's ID in metadata (`missingEquipmentJobId`).
    *   **Test Assertion:** Finds the job using `metadata.missingEquipmentJobId` and asserts its final status is `pending_review` and it has no assigned technician.

*   **Scenario: `weekend-fixed`**
    *   **Purpose:** Verify that a job explicitly assigned a `fixed_schedule_time` falling on a weekend is *not* scheduled and ends up in `pending_review`.
    *   **Generator Logic:** Creates a job and deterministically sets its `fixed_schedule_time` to a date/time known to be on a Saturday or Sunday. Stores the generated job's ID in metadata (`weekendFixedJobId`).
    *   **Test Assertion:** Finds the job using `metadata.weekendFixedJobId`, verifies its `fixed_schedule_time` is indeed a weekend using `isWeekend()`, and asserts its final status is `pending_review` with no assigned technician.

*   **Scenario: `split-bundle`**
    *   **Purpose:** Verify that an order containing multiple jobs, where the required equipment for those jobs is intentionally split across *different* technicians (meaning no single tech can do the whole bundle), results in *all* jobs for that order ending up in `pending_review`.
    *   **Generator Logic:** Creates an order (ID stored in `splitBundleOrderId`) with two specific jobs (IDs stored in `splitBundleJobIds`). Job A requires 'prog' equipment, Job B requires 'immo'. Van 1 is assigned *only* 'prog', Van 2 is assigned *only* 'immo'.
    *   **Test Assertion:** Finds all jobs belonging to `metadata.splitBundleOrderId`. Verifies the count matches `metadata.splitBundleJobIds`. Asserts that *every* job in this set has a final status of `pending_review`.

*   **Scenario: `force-non-work-days`**
    *   **Purpose:** Verify that the scheduler respects technician unavailability defined by exceptions, preventing scheduling during those times. Specifically tests forcing Day+1 and Day+2 as unavailable for all technicians.
    *   **Generator Logic:** Creates `technician_availability_exceptions` entries for *all* technicians covering the entire day for the next two calendar days after the test starts.
    *   **Test Assertion:** Fetches all jobs with final status `queued`. Asserts that *none* of these scheduled jobs have an `estimated_sched` date falling on Day+1 or Day+2 relative to the test start date. (Metadata is not strictly needed for this assertion, as it checks *all* scheduled jobs).

*   **Scenario: `force-fixed-overflow`**
    *   **Purpose:** Verify that a job with a `fixed_schedule_time` set for a *future* working day (e.g., tomorrow) is correctly scheduled by the overflow logic at that specific time.
    *   **Generator Logic:** Creates a job and deterministically sets its `fixed_schedule_time` to 10:00 AM on the next working day relative to the test start. Stores the job ID (`fixedOverflowJobId`) and the exact time string (`fixedOverflowTime`) in metadata.
    *   **Test Assertion:** Finds the job using `metadata.fixedOverflowJobId`. Asserts its status is `queued`, it has an assigned technician, and its `estimated_sched` matches the `metadata.fixedOverflowTime`.

*   **Scenario: `force-technician-unavailable`**
    *   **Purpose:** Verify that the scheduler respects a specific technician's unavailability window defined by an exception.
    *   **Generator Logic:** Creates an exception for Technician ID 1, making them unavailable between 12:00 PM and 4:00 PM on the test start day. Stores the affected technician ID (currently hardcoded as 1 in metadata: `unavailableTechnicianId`).
    *   **Test Assertion:** Finds all jobs assigned to `metadata.unavailableTechnicianId` with status `queued`. Asserts that *none* of these jobs have an `estimated_sched` falling within the 12:00-16:00 window.

*   **Scenario: `force-high-priority-conflict`**
    *   **Purpose:** Verify that when two jobs compete for resources/time (generated for the same order, simple requirements), the higher-priority job (Prio 10) gets scheduled (`queued`), while the lower-priority job (Prio 1) is either scheduled later or becomes `pending_review`.
    *   **Generator Logic:** Creates an order (ID in `conflictOrderId`) with two jobs. Job A (ID in `highPriorityJobId`) is given priority 10. Job B (ID in `lowPriorityJobId`) is given priority 1. Both use a simple service ('diag').
    *   **Test Assertion:** Finds both jobs using IDs from metadata. Asserts the high-priority job (Prio 10) has status `queued`. Asserts the low-priority job (Prio 1) has a status of *either* `queued` OR `pending_review`.

*   **Scenario: `force-low-priority-starvation`**
    *   **Purpose:** Verify that in a situation with many jobs and limited capacity (simulated by forcing many jobs to high priority), low-priority jobs (Prio 1) are likely to be pushed out and become `pending_review`.
    *   **Generator Logic:** Generates a standard set of jobs, then overrides priorities: assigns priority 1 to the first few jobs encountered (IDs stored in `lowPriorityStarvedJobIds`), and assigns high priority (5-10) to all others.
    *   **Test Assertion:** Finds all jobs whose IDs are listed in `metadata.lowPriorityStarvedJobIds`. Asserts that *every* one of these jobs has a final status of `pending_review`.

*   **Scenario: `force-multiple-jobs-same-location`**
    *   **Purpose:** Verify that multiple jobs generated for the exact same address are all successfully scheduled (i.e., the system doesn't fail when handling co-located jobs). This isn't a deep routing efficiency check but ensures basic functionality.
    *   **Generator Logic:** Forces the first 3+ generated orders to use the home address of the first customer user (Address ID stored in `sameLocationAddressId`). Stores the IDs of the jobs created for these orders in `sameLocationJobIds`.
    *   **Test Assertion:** Finds all jobs whose IDs are listed in `metadata.sameLocationJobIds`. Asserts that *every* one of these jobs has a final status of `queued` and is assigned to a technician.

## Previous Plan Details (Outdated/Superseded)

---

[Previous content detailing the older, randomized metadata approach is omitted here for brevity, as it's no longer relevant to the current implementation.]

---

**Implementation Progress (As of YYYY-MM-DD - FINAL UPDATE):**

*   **Framework Setup:** Completed as described in "Implemented Refactoring Strategy".
*   **Implemented Scenarios:** ALL scenarios listed above have been implemented in both the generator (`SIMULATION/generate-dynamic-seed.js`) and the test suite (`tests/e2e/e2e.test.ts`), using the metadata-driven assertion approach.
    *   `missing-equipment` - **DONE**
    *   `weekend-fixed` - **DONE**
    *   `split-bundle` - **DONE**
    *   `force-non-work-days` - **DONE**
    *   `force-fixed-overflow` - **DONE**
    *   `force-technician-unavailable` - **DONE**
    *   `force-high-priority-conflict` - **DONE**
    *   `force-low-priority-starvation` - **DONE**
    *   `force-multiple-jobs-same-location` - **DONE**

*   **Robustness Improvements (Based on AI Review):** Implemented. Test assertions now use IDs dynamically loaded from `seed-metadata.json`, removing reliance on hardcoded values.
