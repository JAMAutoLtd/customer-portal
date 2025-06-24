import { supabase } from './client';
import { YmmRef, CustomerVehicle } from '../types/database.types';
import { logger } from '../utils/logger';

/**
 * Fetches the ymm_id for a given order by looking up the order's vehicle
 * and matching its year, make, and model in the ymm_ref table.
 *
 * @param {number} orderId - The ID of the order.
 * @returns {Promise<number | null>} A promise that resolves to the ymm_id or null if not found.
 */
export async function getYmmIdForOrder(orderId: number): Promise<number | null> {
  console.log(`Fetching ymm_id for order ${orderId}...`);

  // --- Step 1: Fetch ONLY the order record to get vehicle_id --- 
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('id, vehicle_id') // Select only needed fields
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) {
    logger.error(`Error fetching order ${orderId}:`, orderError);
    return null;
  }
  if (!orderData) {
    logger.warn(`Order with ID ${orderId} not found.`);
    return null;
  }
  if (!orderData.vehicle_id) {
    // Specific check if vehicle_id itself is null in the order record
    logger.warn(`Order ${orderId} found, but has a null vehicle_id.`);
    return null;
  }

  const vehicleId = orderData.vehicle_id;

  // --- Step 2: Fetch the customer_vehicle record using the vehicle_id --- 
  const { data: vehicleData, error: vehicleError } = await supabase
    .from('customer_vehicles')
    .select('id, year, make, model')
    .eq('id', vehicleId)
    .single(); // Use single as we expect exactly one vehicle for the ID

  if (vehicleError) {
    logger.error(`Error fetching customer_vehicle with ID ${vehicleId} for order ${orderId}:`, vehicleError);
    // Log specific details if helpful
    if (vehicleError.code === 'PGRST116') { // code for "Fetched primary key differs from local key"
        logger.warn(`No customer_vehicle found with ID ${vehicleId} (linked from order ${orderId}).`);
    }
    return null;
  }
  // No need for !vehicleData check if using .single(), it throws an error if not found
  
  const vehicle = vehicleData; // Assign directly now

  // Check if we have enough info to lookup YMM
  if (!vehicle.year || !vehicle.make || !vehicle.model) {
    // console.warn(`Vehicle details (year, make, model) missing for order ${orderId}. Cannot determine ymm_id.`);
    logger.warn(`Vehicle details (year, make, model) missing for order ${orderId}. Cannot determine ymm_id.`);
    return null;
  }

  // 2. Find the matching ymm_id in ymm_ref based on vehicle details
  const { data: ymmData, error: ymmError } = await supabase
    .from('ymm_ref')
    .select('ymm_id')
    .eq('year', vehicle.year)
    .ilike('make', vehicle.make)
    .ilike('model', vehicle.model)
    .single(); // Expecting a unique YMM combination

  if (ymmError) {
    if (ymmError.code === 'PGRST0' || ymmError.message.includes('JSON object requested, multiple (or no) rows returned')) {
        // console.warn(`No ymm_ref entry found for vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} (Order ID: ${orderId}).`);
        logger.warn(`No ymm_ref entry found for vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} (Order ID: ${orderId}).`);
        return null;
    }
    // console.error(`Error fetching ymm_ref for vehicle ${vehicle.year} ${vehicle.make} ${vehicle.model}:`, ymmError);
    logger.error(`Error fetching ymm_ref for vehicle ${vehicle.year} ${vehicle.make} ${vehicle.model}:`, ymmError);
    throw new Error(`Failed to fetch ymm_ref: ${ymmError.message}`);
  }

  if (!ymmData) {
    // console.warn(`ymm_ref entry not found for vehicle on order ${orderId}.`);
    logger.warn(`ymm_ref entry not found for vehicle on order ${orderId}.`);
    return null;
  }

  console.log(`Found ymm_id ${ymmData.ymm_id} for order ${orderId}.`);
  return ymmData.ymm_id;
}

// Example usage (can be removed later)
/*
async function runYmmExample() {
  try {
    const exampleOrderId = 1; // Replace with an actual order ID from your DB
    const ymmId = await getYmmIdForOrder(exampleOrderId);
    if (ymmId !== null) {
      console.log(`Successfully fetched ymm_id for order ${exampleOrderId}: ${ymmId}`);
    } else {
      console.log(`Could not find ymm_id for order ${exampleOrderId}.`);
    }
  } catch (err) {
    console.error('Failed to run ymm_id example:', err);
  }
}
runYmmExample();
*/ 