
- **Goal:** Ensure robust testing of the fixed-time job implementation.
- **Required Scenarios (in addition to `fixed_time_future_overflow`):**
    - Simple fixed job scheduled for the *current* day.
    - Fixed job today with tight availability around the fixed time.
    - Fixed job in an overflow day with tight availability.
    - Fixed job where the assigned technician becomes ineligible *before* the optimizer run (verify `pending_review` status).
    - (Optional) Fixed job belonging to an order with other non-fixed jobs (verify bundling exclusion and correct scheduling).
- **Reference:** See **Task 3.2** in [`scripts/prd-fixedtimefix.txt`](mdc:scripts/prd-fixedtimefix.txt).
