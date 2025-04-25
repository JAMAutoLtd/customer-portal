const fs = require('fs');
const path = require('path');

// --- Argument Parsing ---
const args = process.argv.slice(2);
let scenario = null;
const scenarioArg = args.find(arg => arg.startsWith('--scenario='));
if (scenarioArg) {
    scenario = scenarioArg.split('=')[1];
}

// --- Configuration ---
const TEMPLATE_DIR = path.join(__dirname, '.template');
const OUTPUT_DIR = path.join(__dirname, 'init-scripts');
const STATIC_DATA_FILE = path.join(OUTPUT_DIR, '05-merged-custom-test-data.sql');
const REQUIREMENTS_DATA_FILE = path.join(OUTPUT_DIR, '06-equipment-requirements-test-data.sql');
const OUTPUT_SEED_FILE = path.join(OUTPUT_DIR, '07-generated-seed-data.sql');

const MIN_ORDERS = 5;
const MAX_ORDERS = 25;
const DOUBLE_JOB_ORDER_PROB = 0.2; // 20% chance
const FUTURE_EARLIEST_TIME_PROB = 0.15; // 15% chance
const FIXED_SCHEDULE_PROB = 0.10; // 10% chance
const EMPTY_STATUS_PROB = 0.05; // 5% chance

// --- NEW Global State for Split Bundle Scenario ---
let splitBundleDetails = {
    orderId: null,
    jobIds: [],
    requiredEquipTypes: [], // e.g., ['prog', 'immo']
    requiredEquipIds: [],   // Corresponding equipment IDs
    serviceIds: []          // Service IDs used in the bundle
};
// --- End NEW Global State ---

// --- NEW Global State for Fixed Overflow Scenario ---
let fixedOverflowDetails = {
    jobId: null,
    fixedTime: null // Store the exact time string used
};
// --- End NEW Global State ---

// --- NEW Global State for Priority Conflict Scenario ---
let priorityConflictDetails = {
    highPriorityJobId: null,
    lowPriorityJobId: null,
    orderId: null
};
// --- End NEW Global State ---

// --- NEW Global State for Low Priority Starvation Scenario ---
let lowPriorityJobIds = [];
// --- End NEW Global State ---

// --- NEW Global State for Same Location Scenario ---
let sameLocationDetails = {
    addressId: null,
    jobIds: []
};
// --- End NEW Global State ---

// --- Helper Functions ---

/**
 * Checks if a given date falls on a Saturday or Sunday.
 * @param {Date} date The date object to check.
 * @returns {boolean} True if the date is a weekend, false otherwise.
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Parses simple multi-row INSERT statements from SQL seed files.
 * Assumes a specific format like:
 * INSERT INTO "schema"."table" ("col1", "col2") VALUES
 *   (val1, val2),
 *   (val3, val4);
 * Handles basic types: numbers, strings (single-quoted), NULL.
 * NOTE: This is a simplified parser for these specific seed files.
 * @param {string} fileContent - The content of the SQL file.
 * @param {string} tableName - The name of the table to parse (e.g., 'services').
 * @returns {object[]} An array of objects representing the parsed rows.
 */
function parseSimpleSqlInserts(fileContent, tableName) {
    const inserts = [];
    // Regex to find the INSERT statement for the specific table and capture columns and the block of VALUES
    const insertStatementRegex = new RegExp(
        `INSERT INTO "public"\\."${tableName}" \\(([^)]+)\\) VALUES\\s*([\\s\\S]*?);`,
        'gi'
    );
    // Regex to find individual value rows like (...), (...) within the VALUES block
    const valueRowRegex = /\((.*?)\)/g;

    let statementMatch;
    while ((statementMatch = insertStatementRegex.exec(fileContent)) !== null) {
        const columns = statementMatch[1].split(',').map(col => col.trim().replace(/"/g, ''));
        const valuesBlock = statementMatch[2]; // The block containing (...) , (...)

        // Reset lastIndex for valueRowRegex before using it on the new valuesBlock
        valueRowRegex.lastIndex = 0;
        let valueMatch;
        while ((valueMatch = valueRowRegex.exec(valuesBlock)) !== null) {
            const rowContent = valueMatch[1]; // Content inside the parentheses for one row

            // Now split this specific row's content
            const rawValues = rowContent.split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim());

            if (rawValues.length !== columns.length) {
                // Escape potential newlines in the warning message for better readability
                const escapedRowContent = rowContent.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
                console.warn(`[Parser Warning] Mismatched columns (${columns.length}) and values (${rawValues.length}) for table ${tableName}. Row content: '${escapedRowContent}'`);
                continue;
            }

            const row = {};
            columns.forEach((col, index) => {
                let value = rawValues[index];
                if (value.toLowerCase() === 'null') {
                    row[col] = null;
                } else if (value.startsWith("'") && value.endsWith("'")) {
                    // Handle potential escaped quotes inside the string
                    row[col] = value.slice(1, -1).replace(/''/g, "'");
                } else if (!isNaN(value) && value.trim() !== '') {
                    row[col] = Number(value); // Convert numbers
                } else {
                    // Handle boolean literals explicitly
                    if (value.toLowerCase() === 'true') {
                        row[col] = true;
                    } else if (value.toLowerCase() === 'false') {
                        row[col] = false;
                    } else {
                        // Keep as string if it's not clearly null, quoted, number, or boolean
                        row[col] = value;
                    }
                }
            });
            inserts.push(row);
        }
    }

    if (inserts.length === 0) {
        // Adjusted warning message
        console.warn(`[Parser Warning] No inserts found or parsed for table ${tableName}. Check SQL file content and structure.`);
    }

    return inserts;
}

/**
 * Helper to select a random element from an array.
 * @param {Array} arr The array to choose from.
 * @returns {*} A random element from the array.
 */
function getRandomElement(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a random integer between min (inclusive) and max (inclusive).
 */
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a random date-time string in SQL format within the next 'days' days.
 */
function getRandomFutureDateTime(days = 7) {
    const now = new Date();
    const futureMillis = now.getTime() + Math.random() * days * 24 * 60 * 60 * 1000;
    const futureDate = new Date(futureMillis);
    // Basic ISO string formatting (YYYY-MM-DD HH:MM:SS) - adjust if timezone needed
    return futureDate.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Generates a random date-time string in SQL format for a weekend within the next 'weeks' weeks.
 */
function getRandomFutureWeekendDateTime(weeks = 4) {
    const now = new Date();
    let futureDate = new Date(now.getTime());
    // Try a few times to find a weekend in the future range
    for (let i=0; i < weeks * 7; i++) { // Limit attempts
        const randomDays = getRandomInt(1, weeks * 7);
        futureDate = new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);
        if (isWeekend(futureDate)) {
            break; // Found a weekend date
        }
    }
    // If loop finished without finding a weekend, force the last generated date to Saturday
    if (!isWeekend(futureDate)) {
        const dayOfWeek = futureDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const daysToAdd = 6 - dayOfWeek; // Days needed to reach Saturday
        futureDate.setDate(futureDate.getDate() + daysToAdd);
    }
    return futureDate.toISOString().slice(0, 19).replace('T', ' ');
}

// --- Data Loading and Processing ---

function loadAndProcessData() {
    console.log('Loading data from SQL templates...');
    const staticDataContent = fs.readFileSync(STATIC_DATA_FILE, 'utf-8');
    const requirementsDataContent = fs.readFileSync(REQUIREMENTS_DATA_FILE, 'utf-8'); // Load requirements

    // 1. Parse Static Data
    const users = parseSimpleSqlInserts(staticDataContent, 'users');
    const customerUsers = users.filter(u => u.is_admin === false || u.is_admin === 'false');
    const customerVehicles = parseSimpleSqlInserts(staticDataContent, 'customer_vehicles');
    const addresses = parseSimpleSqlInserts(staticDataContent, 'addresses');
    const services = parseSimpleSqlInserts(staticDataContent, 'services');
    const ymmRefs = parseSimpleSqlInserts(staticDataContent, 'ymm_ref');
    const equipment = parseSimpleSqlInserts(staticDataContent, 'equipment'); // Added
    const vans = parseSimpleSqlInserts(staticDataContent, 'vans');           // Added
    const technicians = parseSimpleSqlInserts(staticDataContent, 'technicians'); // Added

    if (!customerUsers.length || !customerVehicles.length || !addresses.length || !services.length || !ymmRefs.length || !equipment.length || !vans.length || !technicians.length) {
        throw new Error("Failed to parse essential static data (including vans/equipment/technicians). Check SQL file format and parser logic.");
    }

    // 2. Parse Equipment Requirements
    console.log('Parsing equipment requirements...');
    const serviceEquipmentRequirements = parseSimpleSqlInserts(requirementsDataContent, 'equipment_requirements');
    const serviceToRequiredEquipTypeMap = new Map();
    serviceEquipmentRequirements.forEach(req => {
        const equipmentItem = equipment.find(e => e.id === req.equipment_id);
        if (equipmentItem) {
            if (!serviceToRequiredEquipTypeMap.has(req.service_id)) {
                serviceToRequiredEquipTypeMap.set(req.service_id, []);
            }
            // Store the equipment *type* required by the service
            serviceToRequiredEquipTypeMap.get(req.service_id).push(equipmentItem.equipment_type);
        } else {
            console.warn(`[Requirements Warning] Equipment ID ${req.equipment_id} from requirements not found in loaded equipment data.`);
        }
    });
    console.log(`Processed requirements for ${serviceToRequiredEquipTypeMap.size} services.`);

    // 3. Link Vehicles to YMM IDs (assuming VIN format 'VIN<ymm_id>...')
    // REMOVED: vehicleYmmMap is no longer needed for service filtering, but keep if needed elsewhere.
    // Let's keep it for potential future use or logging, but it's not strictly needed for the current job generation logic.
    const vehicleYmmMap = new Map();
    customerVehicles.forEach(v => {
        // Extract ymm_id from VIN like 'VIN60620000000000' -> 6062
        // Capture exactly 4 digits after "VIN"
        const match = v.vin?.match(/^VIN(\d{4})/);
        if (match && match[1]) {
            const ymmId = parseInt(match[1], 10);
            // Verify this ymmId exists in our ymmRefs
            if (ymmRefs.some(ref => ref.ymm_id === ymmId)) {
                 vehicleYmmMap.set(v.id, ymmId);
            } else {
                 console.warn(`[Data Link Warning] Vehicle VIN ${v.vin} implies ymm_id ${ymmId}, but not found in ymm_refs.`);
            }
        } else {
            console.warn(`[Data Link Warning] Could not extract ymm_id from vehicle VIN: ${v.vin}`);
        }
    });

    console.log(`Loaded ${customerUsers.length} customers, ${customerVehicles.length} vehicles, ${services.length} services, ${vans.length} vans, ${equipment.length} equipment types.`);
    // REMOVED: Log message about validity map
    // console.log(`Built service validity map for ${ymmServiceValidityMap.size} YMM IDs.`);

    return {
        customerUsers,
        customerVehicles,
        addresses,
        services,
        vehicleYmmMap,
        vans,      // Added
        equipment, // Added comma
        serviceToRequiredEquipTypeMap, // Added
        technicians // Added
    };
}


// --- Generation Functions ---

function generateOrders(count, customerUsers /* REMOVED: addresses */) {
    console.log(`Generating ${count} orders...`);
    const orders = [];
    let nextOrderId = 1; // Simple auto-incrementing ID for this generation run

    // Get current time as a potential base for earliest_available_time
    const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');

    let targetAddressIdForSameLocation = null;
    if (scenario === 'force-multiple-jobs-same-location' && customerUsers.length > 0 && customerUsers[0].home_address_id) {
        targetAddressIdForSameLocation = customerUsers[0].home_address_id;
        sameLocationDetails.addressId = targetAddressIdForSameLocation;
        console.log(`[Scenario: force-multiple-jobs-same-location] Targeting address ID: ${targetAddressIdForSameLocation}`);
    }
    // --- End Scenario Prep ---

    let generatedCount = 0;
    let attempts = 0;
    const maxAttempts = count * 2; // Limit attempts to prevent infinite loops if data is bad

    while (generatedCount < count && attempts < maxAttempts) {
        attempts++;
        const user = getRandomElement(customerUsers);

        if (!user) {
            console.warn(`[Order Gen Warning] Failed to select a random user (attempt ${attempts}).`);
            continue; // Try selecting another user
        }

        // Use the user's home_address_id directly
        const homeAddressId = user.home_address_id;

        if (homeAddressId === null || homeAddressId === undefined) {
            console.warn(`[Order Gen Warning] Skipping order generation for user ${user.id} because home_address_id is missing or null.`);
            continue; // Skip this user and try again
        }

        // --- Scenario: force-multiple-jobs-same-location Address Assignment ---
        let addressIdToUse = homeAddressId;
        if (scenario === 'force-multiple-jobs-same-location' && targetAddressIdForSameLocation && generatedCount < 3) { // Force first 3 orders
            addressIdToUse = targetAddressIdForSameLocation;
            console.log(` -> Assigning target address ${addressIdToUse} to order ${nextOrderId}`);
        } else if (scenario === 'force-multiple-jobs-same-location' && !targetAddressIdForSameLocation) {
            console.warn('[Scenario: force-multiple-jobs-same-location] Cannot target address. Using user home address instead.');
        }
        // --- End Scenario Address Assignment ---

        let earliestTime = nowSql;
        if (Math.random() < FUTURE_EARLIEST_TIME_PROB) {
            earliestTime = getRandomFutureDateTime(7); // Random time in next 7 days
        }

        const order = {
            id: nextOrderId++, // Increment ID here
            user_id: user.id,
            vehicle_id: null, // Will be populated in the next step
            repair_order_number: `RO-${Date.now()}-${nextOrderId}`.slice(0, 50),
            address_id: addressIdToUse, // Use potentially overridden address ID
            earliest_available_time: earliestTime,
            notes: `Generated test order ${nextOrderId - 1}`,
            invoice: null, // Added comma
        };
        orders.push(order);
        generatedCount++;
    }

    if (generatedCount < count) {
        console.warn(`[Order Gen Warning] Attempted to generate ${count} orders, but only created ${generatedCount} after ${attempts} attempts. Check customer data for missing home_address_id.`);
    }

    return orders;
}

function generateJobsAndServices(orders, customerVehicles, services, vehicleYmmMap, serviceToRequiredEquipTypeMap, scenario = null) {
    console.log(`Generating jobs for ${orders.length} orders...`);
    const jobs = [];
    const orderServices = [];
    let nextJobId = 1; // Simple auto-incrementing ID for this generation run
    let forcedWeekendJob = false; // Flag for scenario: weekend-fixed
    let forcedProgJob = false;    // Flag for scenario: missing-equipment
    let forcedFixedOverflowJob = false; // Flag for this scenario
    let forcedPriorityConflict = false; // Flag for this scenario
    // --- Scenario: split-bundle Setup ---
    let forcedSplitBundleOrder = false;
    let splitBundleServiceA = null; // Service requiring Equip A
    let splitBundleServiceB = null; // Service requiring Equip B
    let splitBundleEquipTypeA = 'prog'; // Choose specific types
    let splitBundleEquipTypeB = 'immo';
    if (scenario === 'split-bundle') {
        // Find services that require 'prog' and 'immo'
        splitBundleServiceA = services.find(s => serviceToRequiredEquipTypeMap.get(s.id)?.includes(splitBundleEquipTypeA));
        splitBundleServiceB = services.find(s => serviceToRequiredEquipTypeMap.get(s.id)?.includes(splitBundleEquipTypeB));

        if (!splitBundleServiceA || !splitBundleServiceB) {
            console.warn(`[Scenario: split-bundle] Could not find services requiring both '${splitBundleEquipTypeA}' and '${splitBundleEquipTypeB}'. Scenario cannot be guaranteed.`);
        } else if (splitBundleServiceA.id === splitBundleServiceB.id) {
             console.warn(`[Scenario: split-bundle] The identified services for '${splitBundleEquipTypeA}' (${splitBundleServiceA.id}) and '${splitBundleEquipTypeB}' (${splitBundleServiceB.id}) are the same. Split bundle requires distinct services.`);
             splitBundleServiceA = null; // Invalidate to prevent incorrect setup
             splitBundleServiceB = null;
        } else {
             console.log(`[Scenario: split-bundle] Identified Service A (needs ${splitBundleEquipTypeA}): ${splitBundleServiceA.id}, Service B (needs ${splitBundleEquipTypeB}): ${splitBundleServiceB.id}`);
        }
    }
    // --- End Scenario: split-bundle Setup ---

    for (const order of orders) {
        const vehicle = getRandomElement(customerVehicles);
        if (!vehicle) {
            console.warn(`[Job Gen Warning] No vehicles available for order ${order.id}. Skipping.`);
            continue;
        }
        // Assign the randomly selected vehicle back to the order object
        // NOTE: This modifies the order objects passed into the function.
        order.vehicle_id = vehicle.id;

        // --- Scenario: force-high-priority-conflict PREP ---
        // Ensure first order has at least 2 jobs for the conflict
        let numJobs = (Math.random() < DOUBLE_JOB_ORDER_PROB) ? 2 : 1;
        if (scenario === 'force-high-priority-conflict' && order.id === 1) {
            numJobs = 2; // Force 2 jobs for the conflict order
            console.log(`[Scenario: force-high-priority-conflict] Forcing 2 jobs for order ${order.id}`);
        }
        // --- End Scenario Prep ---

        // Use the full list of services for selection
        const allAvailableServices = services; // Renamed for clarity, uses the full 'services' list

        if (allAvailableServices.length === 0) {
             console.warn(`[Job Gen Warning] Global services list is empty. Cannot generate jobs for order ${order.id}.`);
            continue; // Should not happen if static data loads correctly
        }

        // --- Scenario Override: split-bundle ---
        let forceTwoJobsForSplitBundle = false;
        if (scenario === 'split-bundle' && !forcedSplitBundleOrder && splitBundleServiceA && splitBundleServiceB && order === orders[0]) { // Force on the first order
             forceTwoJobsForSplitBundle = true;
             console.log(`[Scenario: split-bundle] Forcing 2 jobs for order ${order.id} using services ${splitBundleServiceA.id} and ${splitBundleServiceB.id}`);
        }
        // --- End Scenario Override ---

        const servicesAddedToOrder = new Set();

        for (let i = 0; i < numJobs; i++) {
            // Filter out services already added to this order for the second job, from the full list
            const availableServicesForThisJob = allAvailableServices.filter(s => !servicesAddedToOrder.has(s.id));
            if (availableServicesForThisJob.length === 0) {
                 // console.log(`[Job Gen Info] No more unique services available for order ${order.id} for job ${i + 1}.`);
                 break; // Stop adding jobs if we run out of unique services
            }

            let service;
            // --- Scenario Override: missing-equipment ---
            if (scenario === 'missing-equipment' && progServiceId && !forcedProgJob && i === 0) { // Force first job of an order
                const progService = availableServicesForThisJob.find(s => s.id === progServiceId);
                if (progService) {
                    service = progService;
                    forcedProgJob = true;
                    console.log(`[Scenario: missing-equipment] Forcing job for service ID ${service.id} on order ${order.id}`);
                } else {
                    // Fallback if the specific prog service isn't available for this job
                    service = getRandomElement(availableServicesForThisJob);
                    console.warn(`[Scenario: missing-equipment] Prog service ${progServiceId} not available for this job, using random.`);
                }
            } else {
                service = getRandomElement(availableServicesForThisJob);
            }
            // --- End Scenario Override ---

            // --- Scenario Override: split-bundle ---
            if (forceTwoJobsForSplitBundle && !forcedSplitBundleOrder) {
                 if (i === 0) {
                     service = splitBundleServiceA;
                     console.log(` -> Assigning split-bundle Service A (${service.id}) to job ${i+1}`);
                 } else { // i === 1
                     service = splitBundleServiceB;
                     console.log(` -> Assigning split-bundle Service B (${service.id}) to job ${i+1}`);
                     // Mark as forced *after* assigning the second service
                     forcedSplitBundleOrder = true;
                     splitBundleDetails.orderId = order.id; // Store the order ID
                     splitBundleDetails.serviceIds = [splitBundleServiceA.id, splitBundleServiceB.id]; // Store service IDs
                     splitBundleDetails.requiredEquipTypes = [splitBundleEquipTypeA, splitBundleEquipTypeB]; // Store types

                     // Store corresponding equipment IDs (assuming one equip ID per type for simplicity here)
                     const equipA = equipment.find(e => e.equipment_type === splitBundleEquipTypeA);
                     const equipB = equipment.find(e => e.equipment_type === splitBundleEquipTypeB);
                     if (equipA && equipB) {
                         splitBundleDetails.requiredEquipIds = [equipA.id, equipB.id];
                     } else {
                         console.warn(`[Scenario: split-bundle] Could not find equipment items for types ${splitBundleEquipTypeA} or ${splitBundleEquipTypeB}.`);
                     }
                 }
                 // Ensure the service wasn't randomly selected by the fallback logic
                 if (!service) {
                    console.error(`[Scenario: split-bundle] Failed to assign service for split-bundle job index ${i}. Aborting job creation for order ${order.id}.`);
                    break; // Stop processing jobs for this order if service assignment failed
                 }
            } else if (!service) { // Fallback to random if not forced or if forcing failed
                service = getRandomElement(availableServicesForThisJob);
            }
             // --- End Scenario Override ---

            // --- Scenario: force-high-priority-conflict Service Selection ---
            // For the conflict scenario, ensure both jobs use a simple service (like one requiring only 'diag')
            if (scenario === 'force-high-priority-conflict' && order.id === 1) {
                const diagService = services.find(s => {
                    const reqs = serviceToRequiredEquipTypeMap.get(s.id);
                    return reqs && reqs.length === 1 && reqs.includes('diag');
                });
                if (diagService && !servicesAddedToOrder.has(diagService.id)) {
                    service = diagService;
                    console.log(` -> [Conflict] Assigning simple diag service ${service.id} for job ${i+1} of order ${order.id}`);
                } else {
                    // Fallback if diag service not found or already used (shouldn't happen for 2 jobs)
                    console.warn('[Scenario: force-high-priority-conflict] Could not assign simple diag service. Using random. Conflict may not occur as expected.');
                    if (!service) service = getRandomElement(availableServicesForThisJob);
                }
            } else if (!service) { // Fallback for non-conflict or if other overrides failed
                service = getRandomElement(availableServicesForThisJob);
            }
            // --- End Scenario Service Selection ---

            if (!service) {
                 console.warn(`[Job Gen Warning] Could not select a service for order ${order.id}, job ${i + 1}.`);
                 break; // Should theoretically not happen
            }

            servicesAddedToOrder.add(service.id);

            const jobId = nextJobId++;
            const status = (Math.random() < EMPTY_STATUS_PROB) ? null : 'queued';
            let fixedTime = null;

            // --- Scenario Override: weekend-fixed ---
            if (scenario === 'weekend-fixed' && !forcedWeekendJob && i === 0) { // Force first job of an order
                fixedTime = getRandomFutureWeekendDateTime(4); // Force a weekend date
                forcedWeekendJob = true;
                console.log(`[Scenario: weekend-fixed] Forcing weekend fixed time (${fixedTime}) for job ID ${jobId}`);
            }
            // --- Scenario Override: force-fixed-overflow ---
            else if (scenario === 'force-fixed-overflow' && !forcedFixedOverflowJob && i === 0 && order === orders[0]) { // Force on first job of first order
                const today = new Date();
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                // Ensure it's not accidentally a weekend for the test base date
                if (isWeekend(tomorrow)) {
                    tomorrow.setDate(tomorrow.getDate() + (tomorrow.getDay() === 6 ? 2 : 1)); // Skip to Mon if Sat, Sun
                }
                tomorrow.setHours(10, 0, 0, 0); // Set to 10:00 AM
                fixedTime = tomorrow.toISOString().slice(0, 19).replace('T', ' ');
                forcedFixedOverflowJob = true;
                fixedOverflowDetails.jobId = jobId; // Store job ID
                fixedOverflowDetails.fixedTime = fixedTime; // Store the time
                console.log(`[Scenario: force-fixed-overflow] Forcing fixed time (${fixedTime}) for job ID ${jobId}`);
            }
            // --- Default Fixed Time Assignment ---
            else {
                fixedTime = (Math.random() < FIXED_SCHEDULE_PROB) ? getRandomFutureDateTime(7) : null;
            }
            // --- End Scenario Override ---
            const duration = getRandomInt(30, 120); // Random duration 30-120 mins
            // --- Scenario: force-high-priority-conflict Priority Assignment ---
            let priority;
            if (scenario === 'force-high-priority-conflict' && order.id === 1) {
                if (i === 0) { // First job (Job ID 1)
                    priority = 10; // High priority
                    priorityConflictDetails.highPriorityJobId = nextJobId; // Store ID (before increment)
                    console.log(` -> [Conflict] Assigning HIGH priority (${priority}) to job ${nextJobId}`);
                } else { // Second job (Job ID 2)
                    priority = 1; // Low priority
                    priorityConflictDetails.lowPriorityJobId = nextJobId; // Store ID (before increment)
                    priorityConflictDetails.orderId = order.id; // Store order ID
                    forcedPriorityConflict = true; // Mark scenario as forced
                    console.log(` -> [Conflict] Assigning LOW priority (${priority}) to job ${nextJobId}`);
                }
            } else {
                priority = getRandomInt(1, 10); // Random priority 1-10 for other jobs
            }
            // --- End Scenario Priority Assignment ---

            const job = {
                id: jobId,
                order_id: order.id,
                assigned_technician: null,
                address_id: order.address_id, // Job address is same as order address
                priority: priority,
                status: status,
                requested_time: null, // Can be added if needed
                estimated_sched: null, // Set by scheduler
                job_duration: duration,
                notes: `Generated job ${jobId} for order ${order.id}, service: ${service.service_name}`,
                service_id: service.id,
                fixed_assignment: false,
                fixed_schedule_time: fixedTime,
                technician_notes: null
            };
            jobs.push(job);

            // Add to order_services join table (ensure unique pairs)
            if (!orderServices.some(os => os.order_id === order.id && os.service_id === service.id)) {
                orderServices.push({ order_id: order.id, service_id: service.id });
            }

            // --- Scenario: split-bundle - Store Job IDs ---
            if (scenario === 'split-bundle' && splitBundleDetails.orderId === order.id) {
                splitBundleDetails.jobIds.push(jobId);
            }
            // --- End Scenario ---

            // --- Scenario: force-multiple-jobs-same-location - Store Job IDs ---
            if (scenario === 'force-multiple-jobs-same-location' && order.address_id === sameLocationDetails.addressId) {
                sameLocationDetails.jobIds.push(jobId);
                 console.log(` -> Tracking job ${jobId} for same location scenario.`);
            }
            // --- End Scenario ---
        }
    }

    // --- Scenario: force-low-priority-starvation Override Job Count & Priority ---
    if (scenario === 'force-low-priority-starvation') {
        console.log('[Scenario: force-low-priority-starvation] Adjusting job priorities...');
        let lowPriorityCount = 0;
        const maxLowPriorityJobs = 3; // Target number of low-priority jobs

        // Re-assign priorities
        jobs.forEach(job => {
            // Assign low priority to the first few jobs encountered
            if (lowPriorityCount < maxLowPriorityJobs) {
                job.priority = 1;
                lowPriorityJobIds.push(job.id); // Store ID
                lowPriorityCount++;
                console.log(` -> Assigning LOW priority (1) to job ${job.id}`);
            } else {
                // Assign high/medium priority to the rest
                job.priority = getRandomInt(5, 10);
                 console.log(` -> Assigning HIGH/MEDIUM priority (${job.priority}) to job ${job.id}`);
            }
        });
        console.log(` -> Final low priority job count: ${lowPriorityCount}`);
    }
    // --- End Scenario Override ---

    return { generatedJobs: jobs, generatedOrderServices: orderServices };
}

// --- NEW Generation Function for Technician Exceptions ---

function generateTechnicianExceptions(technicians, scenario = null) {
    const exceptions = [];
    let nextExceptionId = 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    if (scenario === 'force-non-work-days') {
        console.log('[Scenario: force-non-work-days] Generating availability exceptions for all technicians...');
        const nonWorkDay1 = new Date(today);
        nonWorkDay1.setDate(today.getDate() + 1);
        const nonWorkDay1Start = nonWorkDay1.toISOString().slice(0, 19).replace('T', ' ');
        const nonWorkDay1End = new Date(nonWorkDay1);
        nonWorkDay1End.setHours(23, 59, 59, 999);
        const nonWorkDay1EndStr = nonWorkDay1End.toISOString().slice(0, 19).replace('T', ' ');

        const nonWorkDay2 = new Date(today);
        nonWorkDay2.setDate(today.getDate() + 2);
        const nonWorkDay2Start = nonWorkDay2.toISOString().slice(0, 19).replace('T', ' ');
        const nonWorkDay2End = new Date(nonWorkDay2);
        nonWorkDay2End.setHours(23, 59, 59, 999);
        const nonWorkDay2EndStr = nonWorkDay2End.toISOString().slice(0, 19).replace('T', ' ');

        technicians.forEach(tech => {
            // Exception for Day +1
            exceptions.push({
                id: nextExceptionId++,
                technician_id: tech.id,
                start_time: nonWorkDay1Start,
                end_time: nonWorkDay1EndStr,
                reason: 'E2E Forced Non-Work Day 1'
            });
            // Exception for Day +2
            exceptions.push({
                id: nextExceptionId++,
                technician_id: tech.id,
                start_time: nonWorkDay2Start,
                end_time: nonWorkDay2EndStr,
                reason: 'E2E Forced Non-Work Day 2'
            });
        });
        console.log(` -> Generated ${exceptions.length} exceptions for ${technicians.length} technicians covering Day+1 and Day+2.`);

    } else if (scenario === 'force-technician-unavailable') {
        console.log('[Scenario: force-technician-unavailable] Generating availability exception for Technician 1...');
        const targetTechnicianId = 1; // As per plan
        const techExists = technicians.some(t => t.id === targetTechnicianId);

        if (techExists) {
            const unavailableStart = new Date(today);
            unavailableStart.setHours(12, 0, 0, 0); // 12:00 PM today
            const unavailableStartStr = unavailableStart.toISOString().slice(0, 19).replace('T', ' ');

            const unavailableEnd = new Date(today);
            unavailableEnd.setHours(16, 0, 0, 0); // 4:00 PM today
            const unavailableEndStr = unavailableEnd.toISOString().slice(0, 19).replace('T', ' ');

            exceptions.push({
                id: nextExceptionId++,
                technician_id: targetTechnicianId,
                start_time: unavailableStartStr,
                end_time: unavailableEndStr,
                reason: 'E2E Forced Unavailability'
            });
            console.log(` -> Generated exception for Tech ${targetTechnicianId} from ${unavailableStartStr} to ${unavailableEndStr}.`);
        } else {
            console.warn(`[Scenario: force-technician-unavailable] Technician with ID ${targetTechnicianId} not found in data. Cannot generate exception.`);
        }
    }

    return exceptions;
}

// --- NEW Generation Function for Van Equipment ---

function generateVanEquipment(vans, equipment, scenario = null) {
    console.log('Generating van equipment links...');
    if (scenario) {
        console.log(` -> Applying scenario: ${scenario}`);
        // Placeholder: Add logic here to override default equipment links based on the scenario
        // Example: if (scenario === 'missing-equipment') { /* logic to remove specific equipment */ }
    }

    const vanEquipmentLinks = [];
    const vanIds = vans.map(v => v.id);
    const equipmentMap = new Map(equipment.map(e => [
        e.model?.toLowerCase(), // Add null check for model
        e
    ]));
    const equipmentTypeMap = new Map(); // Map type to list of equipment objects
    equipment.forEach(e => {
        if (!equipmentTypeMap.has(e.equipment_type)) {
            equipmentTypeMap.set(e.equipment_type, []);
        }
        equipmentTypeMap.get(e.equipment_type).push(e);
    });

    const addedLinks = new Set(); // To prevent duplicates: vanId-equipmentId
    const addLink = (vanId, equipmentId) => {
        const key = `${vanId}-${equipmentId}`;
        if (equipmentId !== undefined && vanId !== undefined && !addedLinks.has(key)) {
            // --- Scenario: split-bundle - Prevent cross-assignment ---
            if (scenario === 'split-bundle' && splitBundleDetails.orderId && splitBundleDetails.requiredEquipIds.length === 2) {
                 const [equipIdA, equipIdB] = splitBundleDetails.requiredEquipIds;
                 const van1Id = vanIds[0];
                 const van2Id = vanIds[1];
                 // Don't add Equip B to Van 1
                 if (vanId === van1Id && equipmentId === equipIdB) {
                     console.log(`[Scenario: split-bundle] Preventing Equip B (${equipIdB}) assignment to Van 1 (${van1Id})`);
                     return;
                 }
                 // Don't add Equip A to Van 2
                 if (vanId === van2Id && equipmentId === equipIdA) {
                      console.log(`[Scenario: split-bundle] Preventing Equip A (${equipIdA}) assignment to Van 2 (${van2Id})`);
                     return;
                 }
            }
            // --- End Scenario ---
            vanEquipmentLinks.push({ van_id: vanId, equipment_id: equipmentId });
            addedLinks.add(key);
        }
    };

    // --- Scenario: split-bundle - Explicit assignment ---
    if (scenario === 'split-bundle' && splitBundleDetails.orderId && splitBundleDetails.requiredEquipIds.length === 2 && vanIds.length >= 2) {
        const [equipIdA, equipIdB] = splitBundleDetails.requiredEquipIds;
        const [equipTypeA, equipTypeB] = splitBundleDetails.requiredEquipTypes; // e.g., 'prog', 'immo'
        const van1Id = vanIds[0];
        const van2Id = vanIds[1];
        console.log(`[Scenario: split-bundle] Assigning Equip A (${equipTypeA} - ID ${equipIdA}) exclusively to Van ${van1Id}`);
        console.log(`[Scenario: split-bundle] Assigning Equip B (${equipTypeB} - ID ${equipIdB}) exclusively to Van ${van2Id}`);
        addLink(van1Id, equipIdA); // Force Equip A onto Van 1
        addLink(van2Id, equipIdB); // Force Equip B onto Van 2
    }
    // --- End Scenario ---

    // Rule 1: Link all vans to diag equipment
    const diagEquip = equipmentTypeMap.get('diag')?.[0]; // Assume only one 'diag' type
    if (diagEquip) {
        vanIds.forEach(vanId => addLink(vanId, diagEquip.id));
    } else {
        console.warn("[Van Equip Gen Warning] Cannot find equipment with type 'diag'.");
    }

    // Rule 2: Link first two vans to prog equipment
    const progEquip = equipmentTypeMap.get('prog')?.[0]; // Assume only one 'prog' type
    let progEquipIdToRemove = null;
    if (progEquip) {
        progEquipIdToRemove = progEquip.id;
    }
    if (progEquip) {
        // Check if 'prog' is Equip B in the split-bundle scenario
        const progIsSplitBundleEquipB = scenario === 'split-bundle' &&
                                       splitBundleDetails.orderId &&
                                       splitBundleDetails.requiredEquipIds[1] === progEquip.id;

        if (!(scenario === 'missing-equipment' && progEquip.id === progEquipIdToRemove)) {
            // Add to Van 1 unless it's Split Bundle Equip B
            if (vanIds.length >= 1 && !(progIsSplitBundleEquipB && vanIds[0] === vanIds[0])) { // (vanIds[0] === vanIds[0] is always true, just confirms van index)
                 addLink(vanIds[0], progEquip.id);
            }
            // Add to Van 2 unless it's Split Bundle Equip B (which should already be added only to Van 2)
            if (vanIds.length >= 2 && !(progIsSplitBundleEquipB && vanIds[1] === vanIds[1])) {
                 addLink(vanIds[1], progEquip.id);
            }
        } // else: Skip adding if it's the missing-equipment scenario and this is the target equipment
    } else {
        // Don't warn if it's missing *because* of the scenario
        if (!(scenario === 'missing-equipment')) {
            console.warn("[Van Equip Gen Warning] Cannot find equipment with type 'prog'.");
        }
    }

    // Rule 3: Link van 3 to immo
    const immoEquip = equipmentTypeMap.get('immo')?.[0];
    if (immoEquip) {
         // Check if 'immo' is Equip A in the split-bundle scenario
        const immoIsSplitBundleEquipA = scenario === 'split-bundle' &&
                                       splitBundleDetails.orderId &&
                                       splitBundleDetails.requiredEquipIds[0] === immoEquip.id;

        if (vanIds.length >= 3 && !immoIsSplitBundleEquipA) { // Don't add if it's split bundle Equip A (already on Van 1)
            addLink(vanIds[2], immoEquip.id);
        } else if (immoIsSplitBundleEquipA) {
             console.log(`[Scenario: split-bundle] Skipping regular 'immo' assignment to Van 3 as it's Equip A.`);
        }
    } else {
        console.warn("[Van Equip Gen Warning] Cannot find equipment with type 'immo'.");
    }

    // Rule 4: Link van 4 to airbag
    const airbagEquip = equipmentTypeMap.get('airbag')?.[0];
    if (airbagEquip) {
        if (vanIds.length >= 4) addLink(vanIds[3], airbagEquip.id);
    } else {
        console.warn("[Van Equip Gen Warning] Cannot find equipment with type 'airbag'.");
    }

    // Rule 5: Distribute ADAS equipment
    const adasEquipment = equipmentTypeMap.get('adas') || [];
    const mandatoryAdasModels = ['autel-csc0602/01', 'autel-csc0800']; // Lowercase
    const mandatoryAdasEquip = [];
    const otherAdasEquip = [];

    adasEquipment.forEach(e => {
        // Ensure model exists and is a string before calling toLowerCase
        if (e.model && typeof e.model === 'string') {
            if (mandatoryAdasModels.includes(e.model.toLowerCase())) {
                mandatoryAdasEquip.push(e);
            } else {
                otherAdasEquip.push(e);
            }
        } else {
             console.warn(`[Van Equip Gen Warning] Skipping ADAS equipment with invalid model: ${JSON.stringify(e)}`);
        }
    });

    const numOtherAdasToSelect = Math.floor(otherAdasEquip.length / 2);

    // Shuffle other ADAS equipment
    for (let i = otherAdasEquip.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherAdasEquip[i], otherAdasEquip[j]] = [otherAdasEquip[j], otherAdasEquip[i]];
    }

    const selectedRandomAdas = otherAdasEquip.slice(0, numOtherAdasToSelect);
    const allSelectedAdas = [...mandatoryAdasEquip, ...selectedRandomAdas];

    console.log(`Selecting ${mandatoryAdasEquip.length} mandatory and ${selectedRandomAdas.length} random ADAS tools for distribution.`);

    // Distribute selected ADAS tools randomly among vans
    if (vanIds.length > 0) {
        allSelectedAdas.forEach(adasTool => {
            const randomVanIndex = Math.floor(Math.random() * vanIds.length);
            addLink(vanIds[randomVanIndex], adasTool.id);
        });
    } else {
         console.warn('[Van Equip Gen Warning] No vans available to assign ADAS equipment.');
    }

    console.log(`Generated ${vanEquipmentLinks.length} van_equipment links.`);
    return vanEquipmentLinks;
}

// --- SQL Output ---

function generateSqlInserts(tableName, dataArray) {
    if (!dataArray || dataArray.length === 0) {
        return `-- No data generated for ${tableName}\n`;
    }

    const columns = Object.keys(dataArray[0]);
    const columnList = columns.map(col => `"${col}"`).join(', ');

    const valueStrings = dataArray.map(row => {
        const values = columns.map(col => {
            const value = row[col];
            if (value === null || value === undefined) {
                return 'NULL';
            }
            if (typeof value === 'string') {
                // Escape single quotes within the string
                return `'${value.replace(/'/g, "''")}'`;
            }
            if (typeof value === 'number') {
                return value;
            }
             if (typeof value === 'boolean') { // Handle booleans if needed
                return value ? 'TRUE' : 'FALSE';
            }
            // Fallback for other types (might need adjustment)
             return `'${String(value).replace(/'/g, "''")}'`;
        });
        return `  (${values.join(', ')})`;
    });

    return `-- Data for ${tableName}\nINSERT INTO "public"."${tableName}" (${columnList}) VALUES\n${valueStrings.join(',\n')};\n\n`;
}


// --- Main Execution ---

async function main(scenario) {
    console.log(`Starting dynamic seed data generation${scenario ? ` for scenario: ${scenario}` : '.'}...`);
    const { customerUsers, customerVehicles, addresses, services, vehicleYmmMap, serviceToRequiredEquipTypeMap, technicians, vans, equipment } = loadAndProcessData();

    // --- Identify Specific Equipment for Scenarios ---
    const progEquipment = equipment.find(e => e.equipment_type === 'prog');
    const progServiceId = progEquipment ? serviceToRequiredEquipTypeMap.get(services.find(s => serviceToRequiredEquipTypeMap.get(s.id)?.includes('prog'))?.id) : null;
    // --- End Specific Equipment Identification ---

    const numOrders = getRandomInt(MIN_ORDERS, MAX_ORDERS);
    const orders = generateOrders(numOrders, customerUsers);
    const { generatedJobs, generatedOrderServices } = generateJobsAndServices(orders, customerVehicles, services, vehicleYmmMap, serviceToRequiredEquipTypeMap, scenario);
    const generatedExceptions = generateTechnicianExceptions(technicians, scenario);
    const generatedVanEquipment = generateVanEquipment(vans, equipment, scenario);

    // Combine all SQL statements
    let outputSql = '-- Generated Seed Data --\n\n';

    // Ensure order vehicles are updated before generating order SQL
    orders.forEach(order => {
        if (order.vehicle_id === undefined) {
            // Assign a random vehicle if one wasn't assigned during job generation (shouldn't typically happen)
            const vehicle = getRandomElement(customerVehicles);
            order.vehicle_id = vehicle ? vehicle.id : null; // Fallback to null if no vehicles
        }
    });

    outputSql += generateSqlInserts('orders', orders);
    outputSql += generateSqlInserts('order_services', generatedOrderServices);
    outputSql += generateSqlInserts('jobs', generatedJobs);
    outputSql += generateSqlInserts('technician_availability_exceptions', generatedExceptions);
    outputSql += generateSqlInserts('van_equipment', generatedVanEquipment);

    // Write the combined SQL to the output file
    fs.writeFileSync(OUTPUT_SEED_FILE, outputSql);
    console.log(`Generated dynamic seed data written to: ${OUTPUT_SEED_FILE}`);

    // --- NEW: Generate and write seed-metadata.json ---
    let metadata = {
        generationTimestamp: new Date().toISOString(),
        scenario: scenario || 'default',
        jobCount: generatedJobs.length,
        orderCount: orders.length,
        technicianCount: technicians.length,
        // Add scenario-specific details
    };

    switch (scenario) {
        case 'missing-equipment':
            const progService = services.find(s => serviceToRequiredEquipTypeMap.get(s.id)?.includes('prog'));
            const missingEquipJob = generatedJobs.find(j => j.service_id === progService?.id);
            metadata.missingEquipmentJobId = missingEquipJob?.id || null;
            break;
        case 'weekend-fixed':
            const weekendJob = generatedJobs.find(j => j.fixed_schedule_time && isWeekend(new Date(j.fixed_schedule_time.replace(' ', 'T') + 'Z'))); // Adjust for parsing
            metadata.weekendFixedJobId = weekendJob?.id || null;
            break;
        case 'split-bundle':
            metadata.splitBundleOrderId = splitBundleDetails.orderId;
            metadata.splitBundleJobIds = splitBundleDetails.jobIds;
            break;
        case 'force-fixed-overflow':
            metadata.fixedOverflowJobId = fixedOverflowDetails.jobId;
            metadata.fixedOverflowTime = fixedOverflowDetails.fixedTime;
            break;
        case 'force-technician-unavailable':
            metadata.unavailableTechnicianId = 1; // Still hardcoded here, but reflects the generated exception
            break;
        case 'force-high-priority-conflict':
            metadata.conflictOrderId = priorityConflictDetails.orderId;
            metadata.highPriorityJobId = priorityConflictDetails.highPriorityJobId;
            metadata.lowPriorityJobId = priorityConflictDetails.lowPriorityJobId;
            break;
        case 'force-low-priority-starvation':
            metadata.lowPriorityStarvedJobIds = lowPriorityJobIds;
            break;
        case 'force-multiple-jobs-same-location':
            metadata.sameLocationAddressId = sameLocationDetails.addressId;
            metadata.sameLocationJobIds = sameLocationDetails.jobIds;
            break;
        // Add cases for other scenarios if they generate specific IDs needed by tests
    }

    const metadataFilePath = path.join(__dirname, 'seed-metadata.json');
    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata, null, 2));
    console.log(`Generated scenario metadata written to: ${metadataFilePath}`);
    // --- END NEW ---

}

// Get the scenario from command line arguments
const cliArgs = process.argv.slice(2);
let currentScenario = null;
const scenarioArgIndex = cliArgs.findIndex(arg => arg.startsWith('--scenario='));
if (scenarioArgIndex !== -1) {
    currentScenario = cliArgs[scenarioArgIndex].split('=')[1];
}

main(currentScenario).catch(error => {
    console.error('Error during dynamic seed data generation:', error);
    process.exit(1);
}); 