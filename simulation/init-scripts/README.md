# Simulation Database Initialization Scripts

This directory contains the SQL scripts used to initialize the PostgreSQL database (`scheduler_test_db`) for the simulation environment managed by Docker Compose (`../docker-compose.yml`) and the E2E test runner (`../run-e2e-tests.js`).

## Initialization Process

The database is set up using a sequence of SQL scripts executed in a specific order. This ensures that roles, schema, static reference data, and dynamically generated test data are loaded correctly.

The `../run-e2e-tests.js` script handles the execution of these scripts within the `postgres` container during setup, particularly when the `--generate` flag is used.

## Script Execution Order and Purpose

1.  **`00-roles.sql`**:
    *   Creates the necessary PostgreSQL roles required for the application and database operations.

2.  **`01-schema.sql`**:
    *   Defines the complete database schema, including tables, custom types (enums), functions, sequences, primary keys, foreign keys, indexes, and triggers.

3.  **`05-merged-custom-test-data.sql`**:
    *   Contains static, hand-crafted or previously generated base data for core tables like `users`, `addresses`, `vans`, `equipment`, `services`, `ymm_ref`, `customer_vehicles`, etc. This provides a stable foundation of reference data.

4.  **`06-equipment-requirements-test-data.sql`**:
    *   Contains static data defining the equipment requirements for specific services based on the vehicle's Year-Make-Model (`ymm_id`). This populates tables like `adas_equipment_requirements`, `prog_equipment_requirements`, etc.

5.  **`07-generated-seed-data.sql`**:
    *   **Dynamically Generated:** This file is created by running the `../generate-dynamic-seed.js` script (typically triggered by `../run-e2e-tests.js --generate`).
    *   Contains `INSERT` statements for tables that represent the variable part of a test scenario: `orders`, `jobs`, `order_services`, and `van_equipment`.
    *   The generator script uses the static data loaded by `05-...sql` and `06-...sql` as input to ensure relational validity and realistic scenarios when creating these dynamic records.

## Generating Dynamic Data

To regenerate the dynamic test data (`07-generated-seed-data.sql`), you can run:

```bash
node ../generate-dynamic-seed.js
```

Or, more commonly, run the E2E test runner with the generate flag:

```bash
node ../run-e2e-tests.js --generate
```

This ensures a fresh set of `orders`, `jobs`, etc., is created based on the current static data and generator logic before the tests are executed. 