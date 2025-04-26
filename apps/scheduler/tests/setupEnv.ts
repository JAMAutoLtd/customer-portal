import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
const envPath = path.resolve(__dirname, '../../../.env'); 

dotenv.config({ path: envPath });

console.log(`Attempting to load .env from: ${envPath}`);
if (process.env.ONESTEP_GPS_API_KEY) {
  console.log('ONESTEP_GPS_API_KEY loaded successfully in setupEnv.');
} else {
  console.warn('Warning: ONESTEP_GPS_API_KEY not found after dotenv.config() in setupEnv.');
}
// Add any other global test setup here if needed 