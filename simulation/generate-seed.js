const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

// --- Configuration Constants ---

// Entity Counts
const MIN_TECHS = 2;
const MAX_TECHS = 4;
const MIN_ORDERS = 10;
const MAX_ORDERS = 20;
const MIN_JOBS_PER_ORDER = 1;
const MAX_JOBS_PER_ORDER = 2;

// Probabilities
const FIXED_JOB_PROB = 0.1;
const EARLIEST_TIME_PROB = 0.1;
const INFEASIBLE_EQUIPMENT_PROB = 0.1; // Not currently used to force, just for metadata
const FIXED_JOB_WEEKEND_PROB = 0.05; // % of fixed jobs that should land on weekend
const SERVICE_REQUIRES_EQUIPMENT_PROB = 0.75; // % of services requiring equipment

// Geographic Bounds (Calgary +/- ~75km)
const CENTER_LAT = 51.0447;
const CENTER_LNG = -114.0719;
// Update bounds for ~20km radius
const MIN_LAT = 50.8647; // Approx CENTER_LAT - 0.18
const MAX_LAT = 51.2247; // Approx CENTER_LAT + 0.18
const MIN_LNG = -114.3579; // Approx CENTER_LNG - 0.286
const MAX_LNG = -113.7859; // Approx CENTER_LNG + 0.286

// Availability Times
const DEFAULT_START_TIME_STR = '09:00:00';
const DEFAULT_END_TIME_STR = '18:30:00';

// Other
const MAX_EQUIPMENT_RETRY_ATTEMPTS = 5;
const SQL_OUTPUT_PATH = path.join(__dirname, 'init-scripts', '02-seed-data.sql');
const METADATA_OUTPUT_PATH = path.join(__dirname, 'seed-metadata.json');

// Define categories globally
const equipmentCategories = ['adas', 'airbag', 'immo', 'prog', 'diag'];

// --- NEW: Fixed Service and Equipment Data ---
const FIXED_SERVICES = [
    { id: 1, service_name: 'Front Radar', service_category: 'adas' },
    { id: 2, service_name: 'Windshield Camera', service_category: 'adas' },
    { id: 3, service_name: '360 Camera or Side Mirror', service_category: 'adas' },
    { id: 4, service_name: 'Blind Spot Monitor', service_category: 'adas' },
    { id: 5, service_name: 'Parking Assist Sensor', service_category: 'adas' },
    { id: 6, service_name: 'ECM', service_category: 'prog' },
    { id: 7, service_name: 'TCM', service_category: 'prog' },
    { id: 8, service_name: 'BCM', service_category: 'prog' },
    { id: 9, service_name: 'Airbag Module Reset', service_category: 'airbag' },
    { id: 10, service_name: 'Instrument Cluster', service_category: 'prog' },
    { id: 14, service_name: 'Headlamp Module', service_category: 'prog' },
    { id: 15, service_name: 'Other', service_category: 'prog' },
    { id: 16, service_name: 'Immobilizer R&R', service_category: 'immo' },
    { id: 17, service_name: 'All Keys Lost', service_category: 'immo' },
    { id: 18, service_name: 'Adding Spare Keys', service_category: 'immo' },
    { id: 19, service_name: 'Diagnostic or Wiring', service_category: 'diag' },
];

const FIXED_EQUIPMENT = [
    { id: 5, model: 'airbag', equipment_type: 'airbag' },
    { id: 6, model: 'diag', equipment_type: 'diag' },
    { id: 7, model: 'immo', equipment_type: 'immo' },
    { id: 8, model: 'prog', equipment_type: 'prog' },
    { id: 9, model: 'AUTEL-CSC0602/01', equipment_type: 'adas' },
    { id: 10, model: 'AUTEL-CSC0806/01', equipment_type: 'adas' },
    { id: 11, model: 'AUTEL-CSC0605/01', equipment_type: 'adas' },
    { id: 12, model: 'AUTEL-CSC0601/01', equipment_type: 'adas' },
    { id: 13, model: 'AUTEL-CSC0601/15', equipment_type: 'adas' },
    { id: 14, model: 'AUTEL-CSC0601/08', equipment_type: 'adas' },
    { id: 15, model: 'AUTEL-CSC0601/07', equipment_type: 'adas' },
    { id: 16, model: 'AUTEL-CSC0601/14', equipment_type: 'adas' },
    { id: 17, model: 'AUTEL-CSC0601/03', equipment_type: 'adas' },
    { id: 18, model: 'AUTEL-CSC1004/10', equipment_type: 'adas' },
    { id: 19, model: 'AUTEL-CSC0601/24/01', equipment_type: 'adas' }, // Note: Original image unclear, assuming this model name
    { id: 20, model: 'AUTEL-CSC1004/02', equipment_type: 'adas' },
    { id: 21, model: 'AUTEL-CSC0601/11', equipment_type: 'adas' },
    { id: 22, model: 'AUTEL-CSC0601/06', equipment_type: 'adas' },
    { id: 23, model: 'AUTEL-CSC0601/25', equipment_type: 'adas' },
    { id: 24, model: 'AUTEL-CSC0601/13', equipment_type: 'adas' },
    { id: 25, model: 'AUTEL-CSC1004/03', equipment_type: 'adas' },
];
// --- End NEW Fixed Data ---

// --- Helper Functions ---

function getRandomInt(min, max) {
  // Ensure min/max are valid numbers
  min = Math.ceil(Number(min) || 0);
  max = Math.floor(Number(max) || 0);
  if (min > max) [min, max] = [max, min]; // Swap if min > max
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomCoords(minLat, maxLat, minLng, maxLng) {
  // Increase precision to potentially get coordinates closer to actual features
  const lat = faker.location.latitude({ min: minLat, max: maxLat, precision: 6 });
  const lng = faker.location.longitude({ min: minLng, max: maxLng, precision: 6 });
  return { lat, lng };
}

function getRandomElement(array) {
  if (!Array.isArray(array) || array.length === 0) return null;
  return array[getRandomInt(0, array.length - 1)];
}

function formatSqlValue(value) {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'string') {
        // Escape single quotes for SQL strings
        return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }
    if (value instanceof Date) {
        // Format dates as ISO strings (YYYY-MM-DDTHH:MM:SS.mmmZ)
        return `'${value.toISOString()}'`;
    }
    // Treat numbers and other types directly
    return value;
}

function generateSqlInserts(tableName, dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        // console.warn(`Skipping SQL generation for ${tableName}: Input data is empty or not an array.`);
        return ''; // Return empty string if no data
    }
    // Ensure all items in the array are objects and have keys
    if (typeof dataArray[0] !== 'object' || dataArray[0] === null || Object.keys(dataArray[0]).length === 0) {
        console.error(`Warning: Skipping SQL generation for ${tableName}. Invalid data structure (first element):`, dataArray[0]);
        return '';
    }
    // Quote all column names to handle potential keywords or special characters
    const columns = Object.keys(dataArray[0]).map(col => `"${col}"`).join(', ');
    const values = dataArray.map(row => {
         // Ensure row is an object before trying to get values
        if (typeof row !== 'object' || row === null) {
            console.warn(`Skipping invalid row in generateSqlInserts for ${tableName}:`, row);
            return null; // Mark row as invalid
        }
        // Ensure values align with the columns from the first row
        const rowValues = Object.keys(dataArray[0]).map(col => formatSqlValue(row[col]));
        return `(${rowValues.join(', ')})`;
    })
    .filter(rowString => rowString !== null) // Filter out invalid rows
    .join(',\n       '); // Add newline and indentation for readability

    if (!values) {
        // console.warn(`Warning: No valid rows to insert for ${tableName} after filtering.`);
        return ''; // No valid rows to insert
    }

    // Handle schema name: if tableName includes '.', quote parts; else default to public
    let qualifiedTableName;
    if (tableName.includes('.')) {
        const parts = tableName.split('.');
        qualifiedTableName = `"${parts[0]}"."${parts[1]}"`;
    } else {
        qualifiedTableName = `"public"."${tableName}"`;
    }

    return `INSERT INTO ${qualifiedTableName} (${columns}) VALUES\n       ${values};\n\n`;
}

function getNextSaturday(baseDate) {
    const date = new Date(baseDate);
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7; // Ensure positive difference
    date.setUTCDate(date.getUTCDate() + daysUntilSaturday);
    date.setUTCHours(getRandomInt(9, 17), getRandomInt(0, 59), 0, 0); // Set random time on Saturday
    return date;
}

function getNextSunday(baseDate) {
    const date = new Date(baseDate);
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const daysUntilSunday = (7 - dayOfWeek) % 7; // Ensure positive difference, 0 if already Sunday
    date.setUTCDate(date.getUTCDate() + daysUntilSunday);
     date.setUTCHours(getRandomInt(9, 17), getRandomInt(0, 59), 0, 0); // Set random time on Sunday
    return date;
}

// --- Core Data Generation Functions ---

function generateAddresses(count) {
  console.error(`Generating ${count} addresses...`);
  const addresses = [];
   for (let i = 1; i <= count; i++) {
        const coords = getRandomCoords(MIN_LAT, MAX_LAT, MIN_LNG, MAX_LNG);
        addresses.push({
            id: i, // Simple sequential ID for now
            street_address: faker.location.streetAddress(),
            lat: coords.lat,
            lng: coords.lng
        });
    }
  console.error("Addresses generated.");
  return addresses;
}

function generateUsers(count, addressIds) {
  console.error(`Generating ${count} users...`);
   const users = [];
   const authUsers = []; // Added array for auth.users
   if (!Array.isArray(addressIds)) {
       console.error("Error: addressIds is not an array in generateUsers");
       addressIds = []; // Prevent errors later
   }
    for (let i = 0; i < count; i++) {
        const userId = faker.string.uuid(); // Generate UUID once
        const fullName = faker.person.fullName();
        const firstName = fullName.split(' ')[0] || 'User';
        const lastName = fullName.split(' ').slice(1).join('-') || String(i);
        users.push({
            id: userId, // Use generated UUID
            full_name: fullName,
            phone: faker.phone.number(),
            home_address_id: getRandomElement(addressIds),
            is_admin: false,
            customer_type: getRandomElement(['residential', 'commercial', 'insurance'])
        });
        // Add corresponding auth.users entry
        authUsers.push({
            id: userId, // Use the same UUID
            email: faker.internet.email({ firstName, lastName }), // Generate email
        });
    }
  console.error("Users generated.");
  return { users, authUsers }; // Return both arrays
}

function generateVans(count) {
    console.error(`Generating ${count} vans...`);
    const vans = [];
    for (let i = 1; i <= count; i++) {
        vans.push({
            id: i, // Simple sequential ID
            last_service: null, // Keep simple for now
            next_service: null,
            vin: faker.vehicle.vin(),
            // Add lat/lng if needed by schema, otherwise null/remove
            lat: null,
            lng: null
        });
    }
    console.error("Vans generated.");
    return vans;
}

function generateTechnicians(count, userIds, vanIds, homeAddressIds) {
  console.error(`Generating ${count} technicians...`);
  const technicians = [];
  if (!Array.isArray(userIds) || !Array.isArray(vanIds) || !Array.isArray(homeAddressIds)) {
    console.error("Error: Invalid input arrays for generateTechnicians");
    return technicians; // Return empty
  }
  // Use subset of users
  const availableUserIds = [...userIds];
  // Shuffle the array to get random users for techs
  for (let i = availableUserIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableUserIds[i], availableUserIds[j]] = [availableUserIds[j], availableUserIds[i]];
  }

  const numTechs = Math.min(count, availableUserIds.length, vanIds.length);
  for (let i = 1; i <= numTechs; i++) {
    const userId = availableUserIds[i - 1]; // Assign sequential users from shuffled list
    if (!userId) continue; // Skip if user ID is invalid
    const randomAddressId = getRandomElement(homeAddressIds); // Get a random address ID for current location
    // Assign van strictly 1:1 (no nulls, no randomization)
    const assignedVan = vanIds[i - 1];
    if (!assignedVan) continue; // Defensive: skip if not enough vans

    technicians.push({
      id: i,
      user_id: userId,
      assigned_van_id: assignedVan,
      // REMOVED is_active field
      // current_address_id: randomAddressId, // REMOVED: Not in schema
      // current_address_set_time: new Date() // REMOVED: Not in schema
    });
  }
  console.error("Technicians generated.");
  return technicians;
}

// Function to assign equipment to vans (many-to-many)
// MODIFIED: Added preliminary loop to ensure category coverage
function assignEquipmentToVans(vans, equipment, technicianVanMap) {
    console.error("--- assignEquipmentToVans START ---"); // Log Start
    console.error(`Input: ${vans.length} vans, ${equipment.length} equipment items, ${Object.keys(technicianVanMap).length} tech assignments.`);
    const assignments = [];
    const vanEquipmentMap = {}; // Create map for quick lookup: {vanId: [equipmentId1, equipmentId2,...]}

    if (!Array.isArray(vans) || !Array.isArray(equipment) || typeof technicianVanMap !== 'object' || technicianVanMap === null) {
        console.error("Error: Invalid input arrays or map for assignEquipmentToVans");
        return { assignments, vanEquipmentMap }; // Return empty
    }
    // Add check for empty equipment list
    if (equipment.length === 0 || vans.length === 0) {
        console.error("Error: Cannot assign equipment to vans, equipment list or vans list is empty.");
        return { assignments, vanEquipmentMap };
    }

    // Initialize vanEquipmentMap for all vans
    vans.forEach(van => {
        if (van?.id !== undefined) {
            vanEquipmentMap[van.id] = [];
        }
    });

    // --- Preliminary Assignment: Ensure category coverage ---
    const equipmentByCategory = equipment.reduce((acc, item) => {
        if (item?.equipment_type) {
            if (!acc[item.equipment_type]) {
                acc[item.equipment_type] = [];
            }
            acc[item.equipment_type].push(item);
        }
        return acc;
    }, {});
    console.error("Phase 1: Grouped Equipment By Category:", JSON.stringify(equipmentByCategory, null, 2)); // Log Grouping

    const availableVanIds = vans.map(v => v.id).filter(id => id !== undefined);
    let assignedEquipmentIdsGlobal = new Set(); // Track equipment assigned in this preliminary phase

    console.error("Phase 1: Attempting initial category coverage assignment...");
    for (const category in equipmentByCategory) {
        console.error(`Phase 1: Processing category '${category}'...`); // Log Category Start
        if (availableVanIds.length === 0) {
            console.warn(`Phase 1: No more vans available to assign category ${category}.`);
            break; // No point continuing if no vans left
        }
        const equipmentInCategory = equipmentByCategory[category];
        if (equipmentInCategory.length > 0) {
            let assignedInCategory = false;
            let attempts = 0;
            const maxAttempts = availableVanIds.length * 2; // Limit attempts to avoid infinite loops

            while (!assignedInCategory && attempts < maxAttempts && availableVanIds.length > 0) {
                const randomEquipmentItem = getRandomElement(equipmentInCategory);
                const randomVanId = getRandomElement(availableVanIds);
                attempts++;
                console.error(`Phase 1: Attempt ${attempts} for ${category} - Trying Equip ${randomEquipmentItem?.id} on Van ${randomVanId}`); // Log Attempt

                if (randomEquipmentItem && randomEquipmentItem.id !== undefined && randomVanId !== undefined) {
                    // Check if this specific van already has this item (unlikely here, but good practice)
                    if (!vanEquipmentMap[randomVanId]?.includes(randomEquipmentItem.id)) {
                        // Assign it
                        console.error(`Phase 1: SUCCESS - Assigning ${category} equipment ${randomEquipmentItem.id} to van ${randomVanId}`); // Log Success
                        assignments.push({
                            van_id: randomVanId,
                            equipment_id: randomEquipmentItem.id
                        });
                        vanEquipmentMap[randomVanId].push(randomEquipmentItem.id);
                        assignedEquipmentIdsGlobal.add(randomEquipmentItem.id); // Track globally assigned items
                        assignedInCategory = true; // Move to next category

                        // Optional: Remove van from pool if it got an item?
                        // Depending on desired distribution, could remove vanId from availableVanIds here
                        // For now, allow vans to receive multiple initial items if categories > vans
                    } else {
                        console.error(`Phase 1: FAILED Check - Van ${randomVanId} already has Equip ${randomEquipmentItem.id}`); // Log Check Fail
                    }
                } else {
                   console.error(`Phase 1: FAILED Selection - Invalid Equip (${randomEquipmentItem?.id}) or Van (${randomVanId}) selected.`); // Log Select Fail
                }
            }
            if (!assignedInCategory) {
                 console.warn(`Phase 1: Could not assign equipment for category ${category} after ${attempts} attempts.`);
            }
        }
    }
    console.error("Phase 1: Initial category coverage assignment phase complete.");
    // --- End Preliminary Assignment ---

    // --- NEW: Assign Diagnostic Equipment to Technician Vans ---
    console.error("Phase 2: Assigning diagnostic equipment to technician vans...");
    const diagEquipmentItems = equipment.filter(e => e?.equipment_type === 'diag');
    const assignedVanIds = new Set(Object.values(technicianVanMap));
    console.error(`Phase 2: Tech Van IDs: ${JSON.stringify(Array.from(assignedVanIds))}`); // Log Tech Vans

    if (diagEquipmentItems.length === 0) {
        console.warn("Phase 2: Warning: No diagnostic equipment found in generated equipment. Cannot guarantee assignment to technician vans.");
    } else {
        const primaryDiagItem = diagEquipmentItems[0]; // Use the first available diag tool
        console.error(`Phase 2: Primary Diag Item: ID=${primaryDiagItem.id}, Model=${primaryDiagItem.model}`); // Log Diag Item
        assignedVanIds.forEach(vanId => {
            console.error(`Phase 2: Processing Tech Van ${vanId}...`); // Log Tech Van Start
            if (!vanEquipmentMap[vanId]) {
                console.warn(`Phase 2: Van ID ${vanId} from technician map not found in vanEquipmentMap. Skipping diag assignment.`);
                return; // Skip if van doesn't exist in map (shouldn't happen ideally)
            }
            // Check if this van *already* has ANY diagnostic tool
            const hasDiagAlready = vanEquipmentMap[vanId].some(equipId =>
                diagEquipmentItems.some(diagItem => diagItem.id === equipId)
            );
            console.error(`Phase 2: Van ${vanId} already has DIAG? ${hasDiagAlready}`); // Log Diag Check

            if (!hasDiagAlready) {
                 // Check if the primary diag item is already assigned (only relevant if it's the only one)
                 if (!vanEquipmentMap[vanId].includes(primaryDiagItem.id)) {
                    console.error(`Phase 2: SUCCESS - Assigning DIAG equipment ${primaryDiagItem.id} to tech van ${vanId}`); // Log Success
                    assignments.push({
                        van_id: vanId,
                        equipment_id: primaryDiagItem.id
                    });
                    vanEquipmentMap[vanId].push(primaryDiagItem.id);
                    assignedEquipmentIdsGlobal.add(primaryDiagItem.id); // Track assignment
                } else {
                    // This case should be rare unless the primary diag was assigned in preliminary
                    console.warn(`Phase 2: Van ${vanId} needs DIAG, but primary item ${primaryDiagItem.id} already assigned (likely in preliminary). Already covered.`);
                }
            }
        });
    }
     console.error("Phase 2: Diagnostic equipment assignment phase complete.");
    // --- End Diagnostic Assignment ---

    // --- Existing Random Assignment Logic (slightly adapted) ---
    console.error("Phase 3: Assigning additional random equipment..."); // Log Phase 3 Start
    vans.forEach(van => {
        if (!van?.id) return; // Skip invalid vans
        console.error(`Phase 3: Processing Van ${van.id}...`); // Log Van Start
        // vanEquipmentMap[van.id] is already initialized
        const assignedEquipmentIdsForThisVan = new Set(vanEquipmentMap[van.id]); // Start with already assigned items
        console.error(`Phase 3: Van ${van.id} initial items: ${JSON.stringify(Array.from(assignedEquipmentIdsForThisVan))}`); // Log Initial Items

        // --- REVISED LOGIC for numAdditionalToAssign ---
        // Decide how many *total* items a van should ideally have (e.g., up to 80% of all equipment types)
        const targetTotalItems = getRandomInt(assignedEquipmentIdsForThisVan.size, Math.max(assignedEquipmentIdsForThisVan.size, Math.floor(equipment.length * 0.8)));
        const numAdditionalToAssign = Math.max(0, targetTotalItems - assignedEquipmentIdsForThisVan.size);
        const remainingEquipmentPool = equipment.filter(e => e?.id !== undefined); // Use all equipment as potential pool
        console.error(`Phase 3: Van ${van.id} targetTotalItems=${targetTotalItems}, numAdditionalToAssign=${numAdditionalToAssign}`); // Log Counts
        // --- END REVISED LOGIC ---

        let assignedCount = assignedEquipmentIdsForThisVan.size; // Use size directly
        const targetCount = assignedCount + numAdditionalToAssign; // Correct calculation based on revised logic

        // Assign remaining unique equipment up to the target count for this van
        console.error(`Phase 3: Van ${van.id} attempting to assign ${numAdditionalToAssign} more items (current: ${assignedCount}, target: ${targetCount})...`); // Log Loop Start
        for (let i = assignedCount; i < targetCount; i++) {
            let equipmentItem;
            let attempts = 0;
            // Try to assign a unique piece of equipment (from the whole pool) to *this van*
            do {
                equipmentItem = getRandomElement(remainingEquipmentPool);
                attempts++;
            } while (
                equipmentItem && // Ensure item exists
                assignedEquipmentIdsForThisVan.has(equipmentItem.id) && // Ensure not already on this van
                attempts < remainingEquipmentPool.length * 2 // Safety break based on total pool
            );

            if (equipmentItem && equipmentItem.id !== undefined && !assignedEquipmentIdsForThisVan.has(equipmentItem.id)) {
                console.error(`Phase 3: Van ${van.id} SUCCESS - Assigning additional Equip ${equipmentItem.id} (attempt ${i + 1}/${targetCount})`); // Log Success
                assignedEquipmentIdsForThisVan.add(equipmentItem.id);
                assignments.push({
                    van_id: van.id,
                    equipment_id: equipmentItem.id
                });
                vanEquipmentMap[van.id].push(equipmentItem.id); // Update the map
            } else if (attempts >= remainingEquipmentPool.length * 2) {
                console.warn(`Phase 3: Van ${van.id} could not find additional unique equipment after ${attempts} attempts.`);
                break; // Stop trying if we can't find more unique items
            } else {
                console.error(`Phase 3: Van ${van.id} FAILED to find unique item for assignment ${i + 1}/${targetCount} (Equip ${equipmentItem?.id} already assigned or invalid?)`); // Log Fail
            }
        }
    });
    // --- End Existing Random Assignment Logic ---

    console.error(`--- assignEquipmentToVans END --- Generated ${assignments.length} assignments.`); // Log End
    console.error("Final vanEquipmentMap:", JSON.stringify(vanEquipmentMap, null, 2)); // Log Final Map
    return { assignments, vanEquipmentMap }; // Return both list and map
}

function generateTechnicianDefaultHours(technicians) {
  console.error("Generating default technician hours...");
  const defaultHours = [];
  let currentId = 1;
  const daysOfWeek = [1, 2, 3, 4, 5]; // Monday to Friday

  if (!Array.isArray(technicians)) {
       console.error("Error: Invalid technicians array in generateTechnicianDefaultHours");
       return defaultHours; // Return empty
  }

  technicians.forEach(tech => {
    if (!tech?.id) return; // Skip invalid technicians
    daysOfWeek.forEach(day => {
      defaultHours.push({
        id: currentId++,
        technician_id: tech.id,
        day_of_week: day,
        start_time: DEFAULT_START_TIME_STR,
        end_time: DEFAULT_END_TIME_STR
      });
    });
  });
  console.error("Default technician hours generated.");
  return defaultHours;
}

// Function to generate orders
// MODIFIED: Added technicianHomeAddressCoords param and logic to avoid using them for job addresses
function generateOrders(count, userIds, allAddresses, vehicleIds, technicianHomeAddressCoords, scenarioMetadata, testDay) {
  console.error(`Generating ${count} orders (ensuring no job addresses match technician homes)...`);
  const orders = [];
  const addressIds = allAddresses.map(a => a.id); // Get all available address IDs

  // Input validation (added allAddresses and technicianHomeAddressCoords)
  if (!Array.isArray(userIds) || !Array.isArray(allAddresses) || !Array.isArray(vehicleIds) || !(technicianHomeAddressCoords instanceof Set) || !(testDay instanceof Date)) {
      console.error("Error: Invalid input data types for generateOrders");
      return orders; // Return empty
  }
  if (allAddresses.length === 0) {
      console.error("Error: allAddresses array is empty in generateOrders");
      return orders;
  }

  // Ensure metadata exists
  scenarioMetadata.orderConstraints = scenarioMetadata.orderConstraints || { withEarliestTime: 0 };

  // Assign random attributes to each order
  for (let i = 1; i <= count; i++) {
    // Always set earliest available time to simulate booking time
    // Set it to the start of testDay plus 0-59 minutes
    const earliestTime = new Date(testDay.getTime() + getRandomInt(0, 59) * 60 * 1000);

    // Track status in metadata for scenario analysis
    scenarioMetadata.orderConstraints.withEarliestTime++;

    const userId = getRandomElement(userIds);
    const vehicleId = getRandomElement(vehicleIds);
    // const addressId = getRandomElement(addressIds); // OLD WAY

    // NEW WAY: Find an address that is NOT a technician's home
    let selectedAddress = null;
    let attempts = 0;
    const MAX_ADDRESS_ATTEMPTS = allAddresses.length * 2; // Safety break

    do {
        const potentialAddress = getRandomElement(allAddresses);
        if (potentialAddress && potentialAddress.lat !== undefined && potentialAddress.lng !== undefined) {
            const coordsString = `${potentialAddress.lat},${potentialAddress.lng}`;
            if (!technicianHomeAddressCoords.has(coordsString)) {
                 selectedAddress = potentialAddress;
            }
        }
        attempts++;
    } while (!selectedAddress && attempts < MAX_ADDRESS_ATTEMPTS);

    if (!selectedAddress) {
         console.warn(`Skipping order ${i} after ${attempts} attempts: Could not find a suitable address (non-technician home). This might indicate a very small address pool or high overlap.`);
         // Fallback: Use any address if we failed to find a non-home one (less ideal)
         selectedAddress = getRandomElement(allAddresses);
         if (!selectedAddress) {
            console.error(`Critical Error: Could not select any address for order ${i}. Skipping.`);
            continue; // Skip order if even fallback fails
         }
    }
    const addressId = selectedAddress.id;
    // --- End NEW WAY ---

    if (!userId || !vehicleId || !addressId) {
        console.warn(`Skipping order ${i} due to missing user/vehicle/address ID.`);
        continue;
    }

    orders.push({
      id: i,
      user_id: userId,
      vehicle_id: vehicleId,
      address_id: addressId,
      earliest_available_time: earliestTime, // Always set
      notes: Math.random() < 0.1 ? faker.lorem.paragraph() : null,
    });
  }

  console.error("Orders generated.");
  return orders;
}


// Function to generate jobs linked to orders
function generateJobs(orders, services, equipment, technicians, addresses, _specificServiceRequirements, vanEquipmentMap, fixedJobProb, fixedJobWeekendProb, testDay, scenarioMetadata) {
    console.error(`Generating jobs for ${orders.length} orders...`);
    const jobs = [];
    let currentJobId = 1;

    // Validate inputs - NOTE: _specificServiceRequirements is now ignored
     if (!Array.isArray(orders) || !Array.isArray(services) || services.length === 0 || !Array.isArray(equipment) || equipment.length === 0 || !Array.isArray(technicians) || !Array.isArray(addresses) || typeof vanEquipmentMap !== 'object' || !(testDay instanceof Date)) {
        console.error("Error: Invalid input types or empty services/equipment for generateJobs.");
        return jobs;
    }

    // Pre-filter ADAS equipment models for efficiency in feasibility check
    const adasEquipmentModels = equipment
      .filter(e => e?.equipment_type === 'adas' && e.model)
      .map(e => e.model);
    if (adasEquipmentModels.length === 0) {
        console.warn("Warning: No ADAS equipment models found in the fixed equipment list. ADAS feasibility cannot be checked properly.");
    }

    // Ensure metadata arrays exist
    scenarioMetadata.fixedTimeJobs = scenarioMetadata.fixedTimeJobs || [];
    scenarioMetadata.weekendFixedTimeJobs = scenarioMetadata.weekendFixedTimeJobs || [];
    scenarioMetadata.potentiallyUnschedulableJobIds = scenarioMetadata.potentiallyUnschedulableJobIds || { equipment: [] };
    scenarioMetadata.queuedJobIds = scenarioMetadata.queuedJobIds || [];

    // --- Helper: Check Equipment Feasibility --- NEW LOGIC --- 
    const checkEquipmentFeasibility = (jobServices) => {
        // Validate helper inputs
        if (!Array.isArray(jobServices) || jobServices.length === 0) {
            console.warn("Invalid or empty jobServices input to checkEquipmentFeasibility helper.");
            return false; // Assume infeasible if inputs are bad
        }

        const requiredEquipmentModels = new Set();

        jobServices.forEach(service => {
            // Ensure service is valid and has a category
            if (!service?.id || !service.service_category) {
                 console.warn(`Skipping feasibility check for service ID ${service?.id} due to missing category.`);
                 return; // Cannot determine requirement without category
            }

            const category = service.service_category;
            let modelToAdd = null;

            if (category === 'adas') {
                if (adasEquipmentModels.length > 0) {
                    modelToAdd = getRandomElement(adasEquipmentModels);
                } else {
                    // console.warn(`Cannot determine required ADAS equipment for service ${service.id} as no ADAS models are available.`);
                    // If no ADAS models exist, we can't require one. Feasibility depends on other services.
                }
            } else if (['airbag', 'immo', 'prog', 'diag'].includes(category)) {
                // For other categories, the required model name IS the category name
                modelToAdd = category;
            } else {
                 console.warn(`Unknown service category '${category}' for service ${service.id}. Cannot determine required equipment.`);
            }

            if (modelToAdd) {
                 requiredEquipmentModels.add(modelToAdd);
            }
        });

        if (requiredEquipmentModels.size === 0) {
            // console.log(`No specific equipment models required for this set of services. Feasible.`);
            return true; // No specific equipment model needed, always feasible
        }

        // console.log(`Job requires equipment models: ${[...requiredEquipmentModels]}`);

        // Check if ANY technician has ALL the required equipment models
        let anyTechCanDoJob = false;
        for (const tech of technicians) {
            // Ensure tech and van ID are valid
            if (!tech?.id || tech.assigned_van_id === null || tech.assigned_van_id === undefined) continue;

            const techVanId = tech.assigned_van_id;
            // Ensure van equipment map exists for this van and get the *models*
            const techVanEquipmentIds = vanEquipmentMap?.[techVanId] || [];
            const techVanEquipmentModels = new Set(
                techVanEquipmentIds.map(id => equipment.find(e => e.id === id)?.model).filter(Boolean)
            );

            // console.log(`Checking Tech ${tech.id} (Van ${techVanId}) with equipment models: ${[...techVanEquipmentModels]}`);

            let techHasAllRequired = true;
            for (const requiredModel of requiredEquipmentModels) {
                if (!techVanEquipmentModels.has(requiredModel)) {
                    // console.log(`  - Tech ${tech.id} MISSING required equipment model ${requiredModel}`);
                    techHasAllRequired = false;
                    break;
                }
            }
            if (techHasAllRequired) {
                // console.log(`Technician ${tech.id} has all required equipment models for the job. Feasible.`);
                anyTechCanDoJob = true;
                break; // Found a capable tech, no need to check others
            }
        }
        if (!anyTechCanDoJob) {
             console.warn(`No technician found with all required equipment models (${[...requiredEquipmentModels]}) for this job/order. POTENTIALLY UNFEASIBLE.`);
        }

        return anyTechCanDoJob;
    };
    // --- End Helper --- NEW LOGIC ---

    orders.forEach(order => {
        if (!order?.id) return; // Skip invalid orders

        const numJobs = getRandomInt(MIN_JOBS_PER_ORDER, MAX_JOBS_PER_ORDER);
        const orderServices = []; // Services needed for *this* order
        const jobIdsForOrder = []; // Keep track of job IDs created for this order

        for (let j = 0; j < numJobs; j++) {
            const service = getRandomElement(services); // Get random service from FIXED_SERVICES
             if (!service || service.id === undefined) {
                 console.warn("Could not select a valid service from FIXED_SERVICES. Skipping job creation.");
                 continue;
             }
            orderServices.push(service); // Add selected service to the list for this order

            let fixedScheduleTime = null;
            let isWeekendJob = false;
            if (Math.random() < fixedJobProb) {
                 const daysToAdd = getRandomInt(0, 2); // 0, 1, or 2 days from testDay
                 fixedScheduleTime = new Date(testDay);
                 fixedScheduleTime.setUTCDate(fixedScheduleTime.getUTCDate() + daysToAdd);

                 // Check if this fixed time should be forced onto a weekend
                 if (Math.random() < fixedJobWeekendProb) {
                      isWeekendJob = true;
                      const targetDayOfWeek = getRandomElement([0, 6]); // 0=Sun, 6=Sat
                      const currentDayOfWeek = fixedScheduleTime.getUTCDay();
                      let diff = targetDayOfWeek - currentDayOfWeek;
                      // Ensure diff results in the *next* occurrence of the target weekend day
                      if (diff <= 0) diff += 7; // Move to the next week if needed
                      fixedScheduleTime.setUTCDate(fixedScheduleTime.getUTCDate() + diff);
                 }

                 // Set time between 9 AM and 5 PM (17:00)
                 fixedScheduleTime.setUTCHours(getRandomInt(9, 17), getRandomInt(0, 59), 0, 0);
            }

            const job = {
                id: currentJobId,
                order_id: order.id,
                service_id: service.id,
                status: 'queued', // Default status
                priority: getRandomInt(1, 5),
                assigned_technician: null, // CORRECTED column name
                estimated_sched: null, // CORRECTED column name
                fixed_schedule_time: fixedScheduleTime,
                job_duration: getRandomInt(30, 120), // CORRECTED column name
                address_id: order.address_id, // CORRECTED column name
                notes: Math.random() < 0.1 ? faker.lorem.sentence() : null
            };
            jobs.push(job);
            if (scenarioMetadata?.queuedJobIds) {
                scenarioMetadata.queuedJobIds.push(currentJobId);
            }
            jobIdsForOrder.push(currentJobId); // Add job ID to order list

            if (fixedScheduleTime && scenarioMetadata?.fixedTimeJobs) {
                const jobMetadata = { jobId: currentJobId, fixedTimeISO: fixedScheduleTime.toISOString() };
                if (isWeekendJob && scenarioMetadata.weekendFixedTimeJobs) {
                    scenarioMetadata.weekendFixedTimeJobs.push(jobMetadata);
                } else {
                    scenarioMetadata.fixedTimeJobs.push(jobMetadata);
                }
            }

            currentJobId++;
        }

        // Check feasibility AFTER all jobs/services for the order are determined
        if (orderServices.length > 0 && !checkEquipmentFeasibility(orderServices)) {
             // Warning logged inside helper now
             if (scenarioMetadata?.potentiallyUnschedulableJobIds?.equipment) {
                 // const jobIdsForOrder = jobs.filter(j => j.order_id === order.id).map(j => j.id);
                 scenarioMetadata.potentiallyUnschedulableJobIds.equipment.push(...jobIdsForOrder);
             }
         }
    });

    console.error(`Generated ${jobs.length} jobs.`);
    return jobs;
}


// Function to generate join table data AFTER jobs have potentially been assigned
function generateJoinTableData(orders, jobs) {
    console.error("Generating join table data (order_services)...");
    const orderServices = [];

    if (!Array.isArray(orders) || !Array.isArray(jobs)) {
       console.error("Error: Invalid input arrays for generateJoinTableData");
       return { orderServices }; // Return empty structure
    }

    // Create a map for quick lookup of jobs by order ID
    const jobsByOrder = jobs.reduce((acc, job) => {
        if (job?.order_id !== undefined) {
            if (!acc[job.order_id]) {
                acc[job.order_id] = [];
            }
            acc[job.order_id].push(job);
        }
        return acc;
    }, {});

    orders.forEach(order => {
         if (!order?.id) return; // Skip invalid orders

        const associatedJobs = jobsByOrder[order.id] || [];
        const servicesAddedForThisOrder = new Set(); // Track services per order

        associatedJobs.forEach(job => {
            // Check if this service has already been added for this order
            if (job?.service_id !== undefined && !servicesAddedForThisOrder.has(job.service_id)) {
                orderServices.push({
                    // Primary key is (order_id, service_id), no separate ID needed
                    order_id: order.id,
                    service_id: job.service_id, // Link to the service performed in the job
                });
                servicesAddedForThisOrder.add(job.service_id); // Mark service as added for this order
            }
        });
    });

    console.error(`Generated ${orderServices.length} order_services entries.`);
    return { orderServices }; // Return in an object for clarity
}

// Function to generate the full SQL script
function generateSqlScript(data) {
    console.error("Generating SQL script...");

    let sqlScript = "-- Seed Data Generated by generate-seed.js --\n\n";

    // Add actual insert data
    sqlScript += "-- 6. Insert Data --\n";
    sqlScript += "-- NOTE: Order is important due to foreign key constraints! --\n\n";

    // 1. Addresses (No dependencies)
    sqlScript += generateSqlInserts('addresses', data.addresses);

    // 2. auth.users (No dependencies)
    sqlScript += generateSqlInserts('auth.users', data.authUsers);

    // 3. Users (Depends on addresses, auth.users)
    sqlScript += generateSqlInserts('users', data.users);

    // 4. Vans (No dependencies within this script)
    sqlScript += generateSqlInserts('vans', data.vans);

    // 5. Equipment (No dependencies within this script)
    sqlScript += generateSqlInserts('equipment', data.equipment);

    // 6. ymm_ref (Mock data, no dependencies)
    sqlScript += generateSqlInserts('ymm_ref', data.mockYmmData);

    // 7. Services (No dependencies within this script)
    sqlScript += generateSqlInserts('services', FIXED_SERVICES); // Use fixed data

    // 8. Service Equipment Requirements (Depends on services, equipment, ymm_ref)
    // DELETED SQL Inserts for adas/airbag/immo/prog/diag_equipment_requirements
    // sqlScript += generateSqlInserts('service_equipment_requirements', data.specificServiceRequirements);
    // Replaced with category-specific tables
    // sqlScript += generateSqlInserts('adas_equipment_requirements', data.specificServiceRequirements.adas);
    // sqlScript += generateSqlInserts('airbag_equipment_requirements', data.specificServiceRequirements.airbag);
    // sqlScript += generateSqlInserts('immo_equipment_requirements', data.specificServiceRequirements.immo);
    // sqlScript += generateSqlInserts('prog_equipment_requirements', data.specificServiceRequirements.prog);
    // sqlScript += generateSqlInserts('diag_equipment_requirements', data.specificServiceRequirements.diag);


    // 9. Customer Vehicles (Depends on ymm_ref)
    //    Make sure ymm_id is included in the generated data for the FK.
    //    Only include vehicles if the array exists and has items
    const vehiclesWithYmmId = data.customerVehicles?.map(v => ({
        id: v.id,
        vin: v.vin,
        make: v.make,
        model: v.model,
        year: v.year,
        // ymm_id: v.ymm_id ?? null // REMOVED: ymm_id column does not exist in customer_vehicles
    })) || [];
    if (vehiclesWithYmmId.length > 0) {
        sqlScript += generateSqlInserts('customer_vehicles', vehiclesWithYmmId);
    } else {
         sqlScript += '-- No customer vehicles generated or data invalid --\n';
    }

    // 10. Technicians (Depends on users, vans)
    sqlScript += generateSqlInserts('technicians', data.technicians);

    // 11. Van Equipment (Depends on vans, equipment) - Use data.vanEquipmentAssignments.assignments
    if (data.vanEquipmentAssignments && Array.isArray(data.vanEquipmentAssignments.assignments)) {
        sqlScript += generateSqlInserts('van_equipment', data.vanEquipmentAssignments.assignments);
    } else {
         sqlScript += '-- No van equipment assignments generated or data invalid --\n';
    }

    // 12. Technician Default Hours (Depends on technicians)
    sqlScript += generateSqlInserts('technician_default_hours', data.technicianDefaultHours);

    // 13. Orders (Depends on users, addresses, customer_vehicles)
    sqlScript += generateSqlInserts('orders', data.orders);

    // 14. Jobs (Depends on orders, services, technicians, addresses)
    sqlScript += generateSqlInserts('jobs', data.jobs);

    // 15. Order Services (Depends on orders, services) - Use data.joinTableData.orderServices
    if (data.joinTableData && Array.isArray(data.joinTableData.orderServices)) {
      sqlScript += generateSqlInserts('order_services', data.joinTableData.orderServices);
    } else {
        sqlScript += '-- No order services generated or data invalid --\n';
    }


    console.error("SQL script generated.");
    return sqlScript;
}

// --- Main Execution ---

async function runGeneration() {
    console.error("Starting seed data generation...");
    const startTime = Date.now();
    const testDay = new Date(); // Use current date/time as the base
    testDay.setUTCHours(0, 0, 0, 0); // Set to start of the day UTC

    // Metadata object
    const scenarioMetadata = {
        generationDate: new Date().toISOString(),
        testDayUTCStart: testDay.toISOString(),
        parameters: {
            MIN_TECHS, MAX_TECHS, MIN_ORDERS, MAX_ORDERS, MIN_JOBS_PER_ORDER,
            MAX_JOBS_PER_ORDER, FIXED_JOB_PROB, EARLIEST_TIME_PROB,
            INFEASIBLE_EQUIPMENT_PROB, FIXED_JOB_WEEKEND_PROB, SERVICE_REQUIRES_EQUIPMENT_PROB
        },
        counts: {},
        fixedTimeJobs: [],
        weekendFixedTimeJobs: [],
        potentiallyUnschedulableJobIds: { equipment: [] },
        queuedJobIds: [],
        orderConstraints: { withEarliestTime: 0 }
    };

    // --- Generate Base Data ---
    const numAddresses = Math.max(MAX_TECHS * 2, MAX_ORDERS * 2); // Ensure enough unique addresses potentially
    console.error(`Generating ${numAddresses} addresses initially...`);
    const allAddresses = generateAddresses(numAddresses); // Generate a pool of addresses
    scenarioMetadata.counts.addresses = allAddresses.length;

    const numUsers = MAX_TECHS + getRandomInt(5, 15); // More users than techs
    console.error(`Generating ${numUsers} users...`);
    const { users, authUsers } = generateUsers(numUsers, allAddresses.map(a => a.id)); // Assign homes randomly from the pool
    scenarioMetadata.counts.users = users.length;
    scenarioMetadata.counts.authUsers = authUsers.length;

    const numVans = MAX_TECHS; // 1 van per potential tech
    console.error(`Generating ${numVans} vans...`);
    const vans = generateVans(numVans);
    scenarioMetadata.counts.vans = vans.length;

    // Determine numTechs earlier
    const numTechs = getRandomInt(MIN_TECHS, Math.min(MAX_TECHS, users.length, vans.length));
    console.error(`Determined target number of technicians: ${numTechs}`);

    // Call generateTechnicians *before* needing the result
    console.error(`Generating ${numTechs} technicians...`);
    const technicians = generateTechnicians(numTechs, users.map(u => u.id), vans.map(v => v.id), allAddresses.map(a => a.id));
    if (!Array.isArray(technicians)) {
        console.error("Technician generation failed. Exiting.");
        process.exit(1);
    }
    scenarioMetadata.counts.technicians = technicians.length;

    const equipment = FIXED_EQUIPMENT; // Use fixed data
    console.error(`Using fixed equipment list with ${equipment.length} items.`);
    scenarioMetadata.counts.equipmentTypes = equipment.length;

    const services = FIXED_SERVICES; // Use fixed data
    console.error(`Using fixed services list with ${services.length} items.`);
    scenarioMetadata.counts.services = services.length;

    // RE-ADDED: Define ymmRefs before it's needed
    console.error("Generating YMM references...");
    const ymmRefs = MOCK_YMM_DATA; // Using mock data
    scenarioMetadata.counts.ymmRefs = ymmRefs.length;

    // --- Generate Linking/Dependent Data ---
    // MOVED: Technician generation is now above, before equipment
    // --- Identify and store Technician Home Address Coordinates --- (Depends on technicians)
    const techUserIds = new Set(technicians.map(t => t.user_id));
    const techHomeAddressIds = new Set();
    users.forEach(user => {
        if (techUserIds.has(user.id) && user.home_address_id) {
            techHomeAddressIds.add(user.home_address_id);
        }
    });

    const technicianHomeAddressCoords = new Set();
    allAddresses.forEach(addr => {
        if (techHomeAddressIds.has(addr.id)) {
             if (addr.lat !== undefined && addr.lng !== undefined) {
                technicianHomeAddressCoords.add(`${addr.lat},${addr.lng}`);
            } else {
                 console.warn(`Technician home address ID ${addr.id} has missing coordinates.`);
            }
        }
    });
     console.error(`Identified ${technicianHomeAddressCoords.size} unique technician home address coordinates.`);
    // --- End Technician Home Address Logic ---

    // ADDED: Create a map of technician ID to their assigned van ID (Depends on technicians)
    const technicianVanMap = technicians.reduce((map, tech) => {
        if (tech && tech.id !== undefined && tech.assigned_van_id !== null && tech.assigned_van_id !== undefined) {
            map[tech.id] = tech.assigned_van_id;
        }
        return map;
    }, {});

    console.error("Generating technician default hours...");
    const technicianHours = generateTechnicianDefaultHours(technicians);
    scenarioMetadata.counts.technicianHours = technicianHours.length;

    console.error("Assigning equipment to vans...");
    const { assignments: vanEquipmentAssignments, vanEquipmentMap } = assignEquipmentToVans(vans, equipment, technicianVanMap);
    scenarioMetadata.counts.vanEquipmentAssignments = vanEquipmentAssignments.length;

    const numCustomerVehicles = MAX_ORDERS * 2; // Ensure plenty of vehicles
    console.error(`Generating ${numCustomerVehicles} customer vehicles...`);
    const customerVehicles = generateCustomerVehicles(numCustomerVehicles, ymmRefs);
    scenarioMetadata.counts.customerVehicles = customerVehicles.length;

    // Generate equipment requirements *after* services and equipment are created
    // console.error("Generating service equipment requirements...");
    // REMOVED Call to generateServiceEquipmentRequirements
    // const serviceEquipmentRequirements = generateServiceEquipmentRequirements(services, equipment, ymmRefs); // Pass ymmRefs
    // Flatten the requirements from the category structure for SQL insertion
    // const allServiceEquipmentRequirements = Object.values(serviceEquipmentRequirements).flat();
    // scenarioMetadata.counts.serviceEquipmentRequirements = allServiceEquipmentRequirements.length;
    scenarioMetadata.counts.serviceEquipmentRequirements = 0; // Set count to 0


    const numOrders = getRandomInt(MIN_ORDERS, MAX_ORDERS);
    console.error(`Generating ${numOrders} orders...`);
    // MODIFIED: Pass allAddresses and technicianHomeAddressCoords
    const orders = generateOrders(numOrders, users.map(u=>u.id), allAddresses, customerVehicles.map(v => v.id), technicianHomeAddressCoords, scenarioMetadata, testDay);
    scenarioMetadata.counts.orders = orders.length;

    // Generate jobs *after* orders, services, equipment, technicians, addresses are finalized
    console.error("Generating jobs...");
    const jobs = generateJobs(
        orders,
        services,
        equipment,
        technicians,
        allAddresses, // Pass all addresses
        [], // Pass empty array for requirements (logic moved to checkFeasibility)
        vanEquipmentMap, // Pass the map for feasibility check
        FIXED_JOB_PROB,
        FIXED_JOB_WEEKEND_PROB,
        testDay,
        scenarioMetadata
    );
    scenarioMetadata.counts.jobs = jobs.length;

    // Generate Order Services Join Table Data (Depends on orders, jobs)
    const joinTableData = generateJoinTableData(orders, jobs); // Get object { orderServices }
    scenarioMetadata.counts.orderServicesJoin = joinTableData?.orderServices?.length || 0; // Corrected name

    console.error("Data entity generation complete.");

    // --- Assemble Data for SQL Generation ---
    const allData = {
        addresses: allAddresses,
        authUsers,
        users,
        vans,
        equipment,
        mockYmmData: ymmRefs,
        services,
        // specificServiceRequirements: serviceEquipmentRequirements, // Removed
        customerVehicles,
        technicians,
        vanEquipmentAssignments: vanEquipmentAssignments, // Pass ONLY the assignments array
        technicianDefaultHours: technicianHours,
        orders,
        jobs,
        joinTableData
    };

    // --- Generate SQL ---
    const sqlScript = generateSqlScript(allData);

    // --- Write SQL to File ---
    try {
        fs.writeFileSync(SQL_OUTPUT_PATH, sqlScript);
        console.error(`Seed SQL script written to ${SQL_OUTPUT_PATH}`);
    } catch (err) {
        console.error(`Error writing SQL script: ${err}`);
        throw err; // Re-throw error to be caught by the main catch block
    }

    // --- Write Metadata to File ---
    const metadataJson = JSON.stringify(scenarioMetadata, null, 2);
    try {
        fs.writeFileSync(METADATA_OUTPUT_PATH, metadataJson);
        console.error(`Seed metadata written to ${METADATA_OUTPUT_PATH}`);
    } catch (err) {
        console.error(`Error writing metadata file: ${err}`);
        // Don't exit, but log the error
    }

    console.error("Seed data generation process complete (before stdout output).");
    // --- Return Metadata for Stdout ---
    return scenarioMetadata; // Return the metadata object
}

// --- Execute the generation process ---
// Wrap in an IIFE (Immediately Invoked Function Expression) to use async/await at top level
(async () => {
    try {
        const scenarioMetadata = await runGeneration();
        // Output metadata to stdout ONLY on success
        if (scenarioMetadata) {
            console.log(JSON.stringify(scenarioMetadata)); // Output ONLY metadata JSON to stdout
            console.error("Successfully output metadata to stdout."); // Log success to stderr
        } else {
             console.error("Error: runGeneration completed but returned no metadata.");
             process.exit(1);
        }
    } catch (error) {
        console.error("Seed generation failed:", error.message);
        console.error(error.stack); // Print stack trace for better debugging
        process.exit(1); // Exit with error code
    }
})(); 