import { SupabaseClient } from '@supabase/supabase-js';
// NOTE: While the SupabaseClient is often typed with an auto-generated `Database` type,
// this function uses manually defined types from this project for the update payload.
// Ensure consistency if the auto-generated type is used elsewhere.
import { Job, JobStatus } from '../types/database.types'; // Using manual Job interface

// Define the shape of the data used for updating jobs, derived from the manual Job interface
// Allows updating only specific fields relevant to scheduling outcomes.
export type JobUpdatePayload = Partial<Pick<Job, 'assigned_technician' | 'estimated_sched' | 'status'>>;

// Type for defining a single update operation
export interface JobUpdateOperation {
    jobId: number;
    data: JobUpdatePayload;
}

/**
 * Updates multiple jobs in the database using batch operations.
 * Groups updates by the combination of fields being set to perform fewer requests.
 *
 * @param supabase The Supabase client instance.
 * @param updates An array of JobUpdateOperation objects.
 * @returns A promise that resolves when all updates are complete.
 * @throws Throws an error if any database update fails, summarizing the number of failures.
 */
export async function updateJobs(
    supabase: SupabaseClient<any>,
    updates: JobUpdateOperation[]
): Promise<void> {
    if (!updates || updates.length === 0) {
        console.log('No job updates provided.');
        return;
    }

    console.log(`Attempting to update ${updates.length} jobs using batching...`);

    // Group updates by the data payload to batch identical updates
    const updatesByPayload = new Map<string, number[]>(); // Key: JSON.stringify(data), Value: [jobId, jobId, ...]

    updates.forEach(update => {
        if (!update.data || Object.keys(update.data).length === 0) {
            console.warn(`Skipping update for job ${update.jobId} due to empty update data.`);
            return;
        }
        const key = JSON.stringify(update.data); // Use stringified data as the key
        if (!updatesByPayload.has(key)) {
            updatesByPayload.set(key, []);
        }
        updatesByPayload.get(key)?.push(update.jobId);
    });

    // Create an array of Supabase batch update promises
    const updatePromises = [];
    for (const [dataString, jobIds] of updatesByPayload.entries()) {
        if (jobIds.length > 0) {
            const updateData = JSON.parse(dataString) as JobUpdatePayload;
            console.log(`Batch updating ${jobIds.length} jobs with data: ${dataString}`);
            updatePromises.push(
                supabase
                    .from('jobs')
                    .update(updateData)
                    .in('id', jobIds)
                    .select()
            );
        }
    }

    // Execute all batch updates in parallel
    try {
        const updateResults = await Promise.all(updatePromises);

        let successCount = 0;
        let errorCount = 0;
        const failedBatchDetails: string[] = [];

        updateResults.forEach((result, index) => {
            // Reconstruct which batch this result corresponds to for logging
            const [dataString, jobIds] = Array.from(updatesByPayload.entries())[index];
            
            if (result.error) {
                const errorMsg = `Error batch updating jobs [${jobIds.join(', ')}] with data ${dataString}: ${result.error.message}`;
                console.error(errorMsg, result.error);
                errorCount++;
                failedBatchDetails.push(`Jobs [${jobIds.join(', ')}]: ${result.error.message}`);
            } else {
                successCount += jobIds.length; // Count individual jobs updated in the batch
                console.log(`DEBUG DB Update Result for jobs [${jobIds.join(', ')}]:`, JSON.stringify(result.data, null, 2));
            }
        });

        console.log(`Update summary: ${successCount} jobs updated successfully via ${updatePromises.length} batches, ${errorCount} batches failed.`);

        if (errorCount > 0) {
            throw new Error(`${errorCount} database batch update(s) failed. Details: ${failedBatchDetails.join('; ')}`);
        }

    } catch (error) {
        console.error('Error performing batch job updates:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('An unknown error occurred during database updates.');
    }
} 