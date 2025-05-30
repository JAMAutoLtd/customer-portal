const checkCondition = async (): Promise<boolean> => {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, status, estimated_sched, fixed_schedule_time') // Ensure fixed_schedule_time is selected if needed for logging
    .in('id', allJobIds);

  if (error) {
    console.error('Error fetching jobs for condition check:', error);
    return false;
  }

  if (!jobs) {
    console.log('Condition not met: No jobs returned from query.');
    return false;
  }
  
  // Log the state of all relevant jobs for easier debugging
  // console.log('Current job states for checkCondition:', JSON.stringify(jobs, null, 2));

  let fixedJobProcessed = false;
  let queuedJobsProcessedCount = 0;

  for (const job of jobs) {
    if (job.id === fixedJobId) {
      // A fixed job is processed if its status is 'fixed_time' (meaning it was confirmed for its day)
      // AND it has an estimated_sched (meaning the optimiser ran for its day and confirmed its slot or it was pre-assigned).
      // Its estimated_sched should align with its fixed_schedule_time.
      if (job.status === 'fixed_time' && job.estimated_sched !== null) {
        // Optionally, verify alignment: new Date(job.estimated_sched).getTime() === new Date(job.fixed_schedule_time).getTime()
        fixedJobProcessed = true;
      }
    } else if (queuedJobIds.includes(job.id)) {
      // A queued job is processed if it's now 'queued' (scheduled by optimizer) with an estimated_sched,
      // OR if it has been moved to 'pending_review' (e.g., failed persistent eligibility).
      if ((job.status === 'queued' && job.estimated_sched !== null) || job.status === 'pending_review') {
        queuedJobsProcessedCount++;
      }
    }
  }

  const allProcessed = fixedJobProcessed && queuedJobsProcessedCount === queuedJobIds.length;

  if (allProcessed) {
    console.log('Success: All expected jobs processed correctly.');
    console.log(`  Fixed Job ${fixedJobId}: Processed.`);
    console.log(`  Queued Jobs (${queuedJobIds.join(', ')}): ${queuedJobsProcessedCount}/${queuedJobIds.length} Processed.`);
  } else {
    const processedIds = jobs.filter(j => 
        (j.id === fixedJobId && j.status === 'fixed_time' && j.estimated_sched !== null) ||
        (queuedJobIds.includes(j.id) && ((j.status === 'queued' && j.estimated_sched !== null) || j.status === 'pending_review'))
    ).map(j => j.id);
    console.log(`Condition not met: Found ${processedIds.length} jobs processed (${processedIds.join(', ')}), expected ${allJobIds.length}.`);
    console.log(`  Fixed Job ${fixedJobId} processed: ${fixedJobProcessed}`);
    console.log(`  Queued Jobs processed: ${queuedJobsProcessedCount}/${queuedJobIds.length}`);
    // Detailed log for each job
    // jobs.forEach(j => {
    //   console.log(`  Job ${j.id}: status=${j.status}, estimated_sched=${j.estimated_sched}, fixed_time=${j.fixed_schedule_time}`);
    // });
  }
  return allProcessed;
}; 