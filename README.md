# Overview

## 1. Order Submission

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
- Jobs are created from orders, creating a job for each service requested. The results of the \_equipment_requirements check will be used in determining the assigned technicians.

- **Job Prioritization:**
- Jobs are assigned priorty based on the following:
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

The scheduler is a dynamic system designed to continuously optimize job assignments and technician routes, balancing efficiency, customer ETAs, and job priorities within daily operational constraints.

### Core Components

1.  **Technician Assignment Logic**

    - **Eligibility:** Determines technician suitability based on `van_equipment` versus job `equipment_requirements`.
    - **Order Grouping Preference:** For multi-job orders, prioritizes assigning all jobs to a single, fully equipped technician if available. If not, jobs from the order are assigned individually based on best fit.
    - **ETA Optimization:** When multiple technicians are eligible, selects the one predicted to have the earliest ETA. **Note:** ETA prediction during assignment must simulate placement within the technician's multi-day schedule respecting daily constraints.
    - **Fixed Assignments:** Supports manual ("fixed") job assignments. Fixed jobs _cannot_ be dynamically reassigned but _are_ included in their assigned technician's route optimization.

2.  **Job Queuing & Routing Logic (Daily Planning)**
    - **Daily Boundaries:** Routes are planned on a day-by-day basis, respecting each technician's specific working hours and availability for that day.
    - **Starting Locations:** Route calculation starts from the technician's _current location_ for the first day (today) and from their _home base_ for subsequent days.
    - **Schedulable Units:** Jobs are grouped into units: indivisible blocks for multi-job orders assigned to the same tech, or individual units for single jobs. Block priority is determined by the highest priority job within it.
    - **Priority & Daily Fit:** Units are sorted by priority. The system iteratively fills each available day, selecting the highest priority units that fit within the remaining work time (considering travel + duration).
    - **Route Optimization (Daily TSP):** A TSP algorithm optimizes the sequence of units scheduled _within each specific day_ to minimize travel time for that day.
    - **Multi-Day Schedule:** The result is a multi-day schedule for each technician (e.g., `tech.schedule = {day1: [unitA, unitB], day2: [unitC]}`).
    - **Continuous ETA Updates:** ETAs for _all_ jobs (across all scheduled days) are calculated and updated based on their position in the final, optimized multi-day schedule.

### Dynamic Operation & Recalculation

The system operates dynamically, constantly seeking the optimal state:

- **Recalculation Loop:** Core assignment and daily routing logic is re-evaluated in response to specific events.
- **Re-evaluation Scope:** Re-evaluation considers _all_ active, non-fixed jobs against the current multi-day schedules and technician statuses.
- **Event Triggers:** Recalculations are typically triggered by: new jobs, job status changes, technician status/location changes, manual interventions, or optional periodic timers.

This continuous re-optimization ensures the system adapts to changing conditions, always aiming for the best possible job assignments and ETAs according to defined priorities and daily operational constraints.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
