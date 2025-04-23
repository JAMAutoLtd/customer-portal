// src/server.ts
import express from 'express';
import { runFullReplan } from './scheduler/orchestrator';
import { supabase } from './supabase/client'; // Ensure client is initialized correctly

const app = express();
// Cloud Run supplies the PORT environment variable
const port = process.env.PORT || 8080;

// Middleware to parse JSON bodies (optional, but good practice)
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check request received.');
  res.status(200).send('OK');
});

// Trigger endpoint for Cloud Scheduler
app.post('/run-replan', async (req, res) => {
  console.log('Received trigger request for /run-replan...');
  // TODO: Optional: Add security check (verify header/token from Cloud Scheduler)

  try {
    // Acknowledge the request quickly to avoid Cloud Scheduler timeouts
    res.status(202).send('Accepted: Replanning process initiated.');

    // Run the core logic asynchronously without blocking the response
    console.log('Starting replan process asynchronously...');
    // Intentionally not awaiting the promise here to let the request finish
    runFullReplan(supabase)
      .then(() => {
        console.log('Asynchronous replan process finished successfully.');
      })
      .catch((error) => {
        console.error('Asynchronous replan process failed:', error);
        // Implement more robust error reporting here (e.g., send to logging service)
      });

  } catch (error) {
    // Catch synchronous errors during request handling (less likely here)
    console.error('Error during /run-replan request handling:', error);
    // Ensure a response is sent even if synchronous setup fails
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error during request handling.');
    }
  }
});

const server = app.listen(port, () => {
  console.log(`Scheduler service listening on port ${port}`);
});

// Graceful shutdown handling for Cloud Run
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
       console.log('HTTP server closed.');
       // Add any other cleanup logic here if needed (e.g., close DB connections explicitly if required)
       process.exit(0); // Exit gracefully
    });

    // If server hasn't closed quickly, force exit
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000); // Allow 10 seconds for graceful shutdown
}); 