# JAM Auto - Customer Portal & Scheduler

## Project Structure

This project is a monorepo managed using `pnpm` workspaces. It contains the following main applications and components:

*   **`apps/web`**: The Next.js frontend application for customer interactions (order placement, viewing history) and potentially admin/technician views.
*   **`apps/scheduler`**: The Node.js/TypeScript backend service responsible for core job scheduling logic, interacting with Supabase, Google Maps, One Step GPS, and the optimizer service.
*   **`apps/optimiser`**: A Python/FastAPI backend service using Google OR-Tools to solve the route optimization problems sent by the scheduler.
*   **`simulation/`**: A Docker Compose environment for simulating the backend (Postgres, PostgREST, Optimizer) for local development and end-to-end testing.
*   **`docs/`**: Contains detailed technical documentation, specifications, and guides. **See [./docs/index.md](./docs/index.md) for the main documentation hub.**

## Overview

This section provides a high-level overview of the customer order flow and the backend scheduling system.

### 1. Order Submission

**Customer provides the following information:**

- **Vehicle Information:**
  - **VIN** \(or **Year/Make/Model** if VIN is unavailable; form auto-calculates YMM from VIN\)
- **Repair Order Number:** _\(Insurance customers only\)_
- **Address:** Selected from saved addresses \(modifiable by admin or customer; addresses may be shared\)
- **Earliest Available Date & Time**
- **Services Required:** _\(Multiple selections allowed\)_
  - **ADAS:**
    - Front Radar
    - Windshield Camera
    - 360 Camera/Side Mirror
    - Blind Spot Monitor
    - Parking Assist Sensor
  - **Module Replacement Programming:**
    - ECM, TCM, BCM, Airbag Module, Instrument Cluster, Front Radar, Windshield Camera, Blind Spot Monitor, Headlamp Module, Other
  - **Keys or Immobilizer Programming:**
    - Immobilizer Module Replaced
    - All Keys Lost/No Working Keys
      - **Push Button Start:**
        - JAM Provides Keys \(with Key Quantity\)
        - Customer Provides Keys \(with Key Quantity\)
      - **Blade Ignition:**
        - JAM Provides Keys \(with Key Quantity\)
        - Customer Provides Keys \(with Key Quantity\)
    - Adding Spare Keys _\(same options as above\)_
  - **Diagnostic or Wiring Repair**
- **Additional Details:**
  - Notes
  - Uploads \(pictures, scan reports, etc.\)

---

## 2. Checks & Processes

- **ADAS Equipment Check:**
  - For each service requested, find the equipment required for the service/vehicle in our database, e.g. for Front Radar service on vehicle 2022 ACURA ILX, use AUTEL-CSC0602/01.
- **Inventory Check for Key Jobs:**
  - Check inventory with [Boxhero Inventory Management](https://www.boxhero.io).
  - If keys are out of stock:
    - Generate a quote using [Keydirect](https://keydirect.ca/) \(CAD\) and [UHS Hardware](https://www.uhs-hardware.com/) \(USD, customs\).
    - On customer acceptance, notify admin to order keys and confirm the job schedule.
    - Key jobs are scheduled only after keys are confirmed in stock or ordered, with a 3-day wait if keys must be ordered.
- **Invoice Generation \(Insurance Orders\):**
- Create unsent invoices to the customer using QuickBooks, incorporating the Repair Order Number, vehicle details, and any attached order files.

---

## 3. Job Creation & Prioritization

- **Job Creation:**
- Jobs are created from orders, typically one job per service requested. The results of the equipment requirements check are used in determining technician eligibility.

- **Job Prioritization:**
- Jobs are assigned priority based on the following (lower number = higher priority):
  1. Insurance customer jobs
  2. Commercial customer ADAS jobs
  3. Airbag jobs
  4. Key/Immobilizer jobs
  5. Commercial customer module replacement and diagnostic jobs
  6. Residential customer module replacement jobs
  7. Residential customer ADAS jobs
  8. Residential customer diagnostic jobs

---

## SCHEDULER SYSTEM OVERVIEW

(See [./docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md) and [./docs/reference/OVERVIEW.md](./docs/reference/OVERVIEW.md) for more details)

The scheduler (`apps/scheduler`) is a dynamic system designed to continuously optimize job assignments and technician routes, balancing efficiency, customer ETAs, and job priorities within daily operational constraints.

### Core Components

1.  **Technician Assignment Logic**
2.  **Job Queuing & Routing Logic (Daily Planning)**
3.  **Dynamic Operation & Recalculation**

---

## Getting Started

For detailed setup instructions (cloning, dependencies, environment variables), see the [**Development Guide**](./docs/guides/DEVELOPMENT.md#setup-instructions).

## Development Workflow

For common commands (running dev servers, building, testing, linting), see the [**Development Guide**](./docs/guides/DEVELOPMENT.md#common-development-workflows).

*   **Key Commands:**
    *   Install all dependencies: `pnpm install`
    *   Run web dev server: `pnpm run dev`
    *   Run scheduler dev server: `pnpm run dev:scheduler`
    *   Run optimiser dev server: `pnpm run dev:optimiser`
    *   Run all unit tests: `pnpm run test`
    *   Run E2E tests: `pnpm run test:e2e --generate`

## Simulation Environment

For local backend development and testing, use the simulation environment.
See the [**Testing Guide**](./docs/guides/TESTING.md#end-to-end-e2e-tests) for usage and `simulation/README.md` for manual setup details.

## Deployment

*   The **Frontend (`apps/web`)** is deployed to **Vercel**.
*   The **Backend services (`apps/scheduler`, `apps/optimiser`)** are deployed to **Google Cloud Run** via **Google Cloud Build** triggers.

See [Backend Deployment Guide](./docs/architecture/DEPLOYMENT.md) for more details.

## Environment Variables

See the [**Development Guide**](./docs/guides/DEVELOPMENT.md#environment-setup) for a list and description of required environment variables.

---
*This project was initially bootstrapped based on Next.js.*
