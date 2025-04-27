import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

console.log('Loaded environment variables for integration tests from .env.test');
// Add any other global setup needed for integration tests here 