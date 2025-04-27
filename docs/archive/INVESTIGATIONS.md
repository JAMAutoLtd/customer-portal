# E2E Test Scenario Investigations & Refinements

This document tracks findings from E2E test runs and outlines necessary refinements or investigations.

## Scenario Status & Findings (Post-Refactoring)

*   **`missing-equipment`**: PASSED. Verified ok.
*   **`weekend-fixed`**: PASSED. Verified ok.
*   **`split-bundle`**: PASSED. Verified ok.
*   **`force-non-work-days`**: PASSED, but needs refinement.
*   **`force-fixed-overflow`**: PASSED. Verified ok.
*   **`force-technician-unavailable`**: FAILED. Requires investigation.
*   **`force-high-priority-conflict`**: PASSED. Verified ok.
*   **`force-low-priority-starvation`**: PASSED. Verified ok.
*   **`force-multiple-jobs-same-location`**: PASSED. Verified ok.

## Detailed Findings & Actions

### 1. `force-non-work-days` Refinement

*   **Observation:** The test run passed, but analysis showed that all initially queued jobs fit within Day 0 (the test start date). Therefore, the overflow logic wasn't actually stressed against the Day+1/Day+2 exceptions.
*   **Required Action:** Modify `SIMULATION/generate-dynamic-seed.js` for the `force-non-work-days` scenario to guarantee overflow. This likely involves increasing the number of generated jobs (`MAX_ORDERS`) or increasing the average `job_duration` specifically for this scenario to ensure capacity on Day 0 is exceeded, forcing the scheduler to *attempt* scheduling on the blocked Day+1 and Day+2.
*   **Goal:** Confirm that jobs genuinely needing to overflow are correctly pushed to Day+3 (Monday) when Day+1/2 are blocked by exceptions.

### 2. `force-fixed-overflow` Clarification

*   **Observation:** Initial analysis suggested a time discrepancy based on the console summary log. However, closer inspection of the database update logs and the test assertion logic confirms the job *is* correctly scheduled at the precise fixed time (`10:00:00` in the test run) on the future day.
*   **Required Action:** None required for code/test logic. The core functionality is correct. The discrepancy exists only in the post-run console summary formatting within `orchestrator.ts`, which does not affect the actual scheduling or test validity.
*   **Goal:** Acknowledge the minor logging difference but confirm the scenario works as intended.

### 3. `force-technician-unavailable` Investigation (FAILED TEST)

*   **Observation:** The test failed because jobs were scheduled for Technician 1 during the 12:00-16:00 window where an exception was generated.
*   **Analysis:**
    *   `src/scheduler/availability.ts` correctly identifies the exception and calculates the *discontinuous* availability windows for the technician (e.g., 09:00-12:00 and 16:00-18:30).
    *   The `OptimizationRequestPayload` type (`src/types/optimization.types.ts`) currently only allows a *single* `earliestStartTimeISO` and `latestEndTimeISO` per technician.
    *   The likely cause of failure is `src/scheduler/payload.ts` incorrectly translating the discontinuous windows into the single-window payload format. It probably sends the overall window (09:00-18:30) or only the first part (09:00-12:00) to the optimizer, which then lacks the information about the 12:00-16:00 gap.
    *   The Python `optimize-service` would also need modification to handle multiple time windows per technician if the payload were updated.
*   **Required Action:** Significant investigation and likely refactoring are needed:
    1.  Decide on a strategy: Either modify the payload and optimizer to support multiple time windows OR adjust the availability calculation to only provide the *longest continuous block* if the optimizer cannot handle gaps.
    2.  If supporting multiple windows: Modify `OptimizationRequestPayload` type, update `payload.ts` to generate the new structure, and update `optimize-service/main.py` to apply multiple time window constraints in OR-Tools.
    3.  If simplifying: Modify `availability.ts` to return only the largest single block when exceptions create gaps (this might be less accurate but easier to implement).
*   **Goal:** Correctly prevent scheduling during technician exception windows.

### 4. `force-low-priority-starvation` Review

*   **Observation:** The user questioned if priority was implemented sufficiently for this test.
*   **Analysis:** The generator correctly assigns low (1) and high (5-10) priorities. The `OptimizationRequestPayload` includes priority. The OR-Tools solver used in `optimize-service` inherently handles priority/penalty objectives. The test run correctly resulted in the low-priority jobs being left as `pending_review` while higher-priority jobs filled capacity.
*   **Required Action:** None. The test and underlying system logic correctly handle priority.
*   **Goal:** Implement priority incrementing based on number of days since order placement as a starvation prevention mechanism, and adjust testing to test this.

## Recommended Next Steps

1.  **Investigate and Fix `force-technician-unavailable` Failure:**
    *   **Reasoning:** This is the highest priority as it represents a functional bug where technician exceptions are not correctly preventing scheduling during unavailable times. The core issue likely lies in how discontinuous availability windows are passed to the optimizer via the payload.
    *   **Action:** Analyze `src/scheduler/payload.ts` and potentially `optimize-service/main.py` to determine the best approach (support multiple windows or simplify availability calculation) and implement the fix.

2.  **Refine `force-non-work-days` Test Generation:**
    *   **Reasoning:** While the test currently passes, it doesn't guarantee that overflow logic is stressed. Ensuring sufficient job load will make the test more robust in verifying that overflow correctly skips blocked non-work days.
    *   **Action:** Modify `SIMULATION/generate-dynamic-seed.js` to increase job count or duration specifically for this scenario. 