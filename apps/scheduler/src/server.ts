import path from 'path'
import dotenv from 'dotenv'
import express, { Request, Response, NextFunction } from 'express'
import { runFullReplan } from './scheduler/orchestrator'
import { supabase } from './supabase/client'
import { logger } from './utils/logger'
import morgan from 'morgan'
import helmet from 'helmet'
import cors from 'cors'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const app = express()
// Cloud Run supplies the PORT environment variable
const port = process.env.PORT || 8080

// Middleware to parse JSON bodies (optional, but good practice)
// app.use(express.json()) // Temporarily disabled
// app.use(morgan('dev')) // Temporarily disabled
// app.use(helmet()) // Temporarily disabled
// app.use(cors()) // Temporarily disabled

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check request received.')
  res.status(200).send('OK')
})

// State variable to prevent concurrent runs
let isReplanRunning = false

// Trigger endpoint for Cloud Scheduler
app.post('/run-replan', async (req: Request, res: Response) => {
  if (isReplanRunning) {
    return res.status(429).send('Replan process is already running.')
  }

  isReplanRunning = true
  // Log before sending response
  logger.info('>>> isReplanRunning flag set to true. About to send 202.');
  // Respond immediately BUT DO NOT RETURN YET - let the async process start
  res.status(202).send('Replan process initiated asynchronously.')

  // --- Start Diagnostics ---
  try {
    // Run the replan asynchronously
    runFullReplan(supabase) // Intentionally not awaited
      .then(() => {
        logger.info('Asynchronous runFullReplan process RESOLVED successfully.');
      })
      .catch((error) => {
        logger.error('Asynchronous runFullReplan process REJECTED:', error)
      })
      .finally(() => {
        logger.info('/run-replan handler FINALLY block reached (async task settled).');
        isReplanRunning = false // Reset the flag
      })

  } catch (syncError) {
    // Catch synchronous errors during the setup/initiation of the async call
    logger.error('CRITICAL: Synchronous error occurred while trying to start runFullReplan:', syncError);
    isReplanRunning = false; 
  }
  // --- End Diagnostics ---

  // Explicit return to satisfy TypeScript TS7030 for async function
  return; 
})

// Basic Error Handling Middleware
// app.use((err: any, req: Request, res: Response, next: NextFunction) => { // Temporarily disabled
//   logger.error('Unhandled error:', err)
//   res.status(500).send('Internal Server Error')
// })

const server = app.listen(port, () => {
  logger.info(`Scheduler service listening on port ${port}`)
})

// Graceful shutdown handling for Cloud Run
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed.')
    // Add any other cleanup logic here if needed (e.g., close DB connections explicitly if required)
    process.exit(0) // Exit gracefully
  })

  // If server hasn't closed quickly, force exit
  setTimeout(() => {
    console.error(
      'Could not close connections in time, forcefully shutting down',
    )
    process.exit(1)
  }, 10000) // Allow 10 seconds for graceful shutdown
})
