import axios, { AxiosError } from 'axios';
import { OptimizationRequestPayload, OptimizationResponsePayload } from '../types/optimization.types';
import { logger } from '../utils/logger'; // Import logger
import { GoogleAuth } from 'google-auth-library';

// Instantiate GoogleAuth
const auth = new GoogleAuth();
let idTokenClient: any = null; // Cache the IdTokenClient

// Base URL for the optimization microservice, configurable via environment variable
const OPTIMIZATION_SERVICE_URL = process.env.OPTIMIZATION_SERVICE_URL;
const OPTIMIZER_TIMEOUT_MS = process.env.OPTIMIZER_TIMEOUT_MS ? parseInt(process.env.OPTIMIZER_TIMEOUT_MS, 10) : 60000; // Default 60 seconds

if (!OPTIMIZATION_SERVICE_URL) {
  // console.error('OPTIMIZATION_SERVICE_URL environment variable is not set.');
  logger.error('OPTIMIZATION_SERVICE_URL environment variable is not set.');
  // Potentially exit or throw an error depending on how critical this is at startup
  throw new Error('OPTIMIZATION_SERVICE_URL must be configured.');
}

/**
 * Calls the external optimization service with authentication.
 * @param payload The optimization request payload.
 * @returns The optimization response payload.
 */
export async function callOptimizationService(
  payload: OptimizationRequestPayload
): Promise<OptimizationResponsePayload> {
  // Remove diagnostic log

  logger.info(`Calling optimization service at: ${OPTIMIZATION_SERVICE_URL}`);

  try {
    let authHeaders = {}; // Default to empty headers

    // --- Conditionally bypass OIDC token fetch ---
    if (process.env.BYPASS_OPTIMIZER_AUTH !== 'true') {
      // console.log('Fetching OIDC token for optimization service...');
      logger.debug('Fetching OIDC token for optimization service...');
      if (!idTokenClient) {
        // Add ! assertion as the check at the top guarantees it's defined
        idTokenClient = await auth.getIdTokenClient(OPTIMIZATION_SERVICE_URL!);
        // console.log('Initialized IdTokenClient.');
        logger.debug('Initialized IdTokenClient.');
      }
      // Fetch the necessary headers, including the Authorization: Bearer token.
      // getRequestHeaders() handles token caching and refreshing.
      // Restore direct usage of idTokenClient.getRequestHeaders
      authHeaders = await idTokenClient.getRequestHeaders(OPTIMIZATION_SERVICE_URL!);
      // console.log('Successfully fetched OIDC token header.');
      logger.debug('Successfully fetched OIDC token header.');
    } else {
      // console.log('BYPASS_OPTIMIZER_AUTH=true detected. Skipping OIDC token fetch.');
      logger.info('BYPASS_OPTIMIZER_AUTH=true detected. Skipping OIDC token fetch.');
    }
    // --- End Conditional Bypass ---

    // Construct the full URL with the specific endpoint path
    // Add ! assertion as the check at the top guarantees it's defined
    const fullOptimizeUrl = `${OPTIMIZATION_SERVICE_URL!.replace(/\/$/, '')}/optimize-schedule`; // Remove trailing slash if exists, add endpoint
    // console.log(`Posting payload to full URL: ${fullOptimizeUrl}`);
    logger.debug(`Posting payload to full URL: ${fullOptimizeUrl}`);

    // Make the authenticated request using axios to the full URL
    const response = await axios.post<OptimizationResponsePayload>(
      fullOptimizeUrl, // Use the constructed URL with path
      payload,
      {
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders, // Spread potentially empty authHeaders
        },
        timeout: OPTIMIZER_TIMEOUT_MS // Use the configured timeout
      }
    );

    logger.info('Optimization service call successful.');
    // Remove diagnostic log
    return response.data;

  } catch (error) {
    // --- Enhanced Error Handling --- 
    logger.error('Error calling optimization service:', error); // Log the raw error

    // Axios error handling for more details
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // Server responded with a status code outside the 2xx range
        // console.error('Optimization Service Response Status:', axiosError.response.status);
        logger.error('Optimization Service Response Status:', axiosError.response.status);
        logger.error(
          'Optimization Service Response Data:',
          JSON.stringify(axiosError.response.data, null, 2) || 'No response data'
        );
      } else if (axiosError.request) {
        // Request was made but no response was received
        // console.error('Optimization Service Request Error:', axiosError.request);
        logger.error('Optimization Service Request Error - No response received');
      } else {
        // Something happened in setting up the request
        // console.error('Optimization Service Setup Error:', axiosError.message);
        logger.error('Optimization Service Setup Error:', axiosError.message);
      }
    } else {
      // Non-Axios error
      // console.error('Non-Axios error during optimization call:', error);
      logger.error('Non-Axios error during optimization call:', error);
    }
    
    // Re-throw the error to be handled by the orchestrator
    throw error;
    // --- End Enhanced Error Handling ---
  }
  // Remove diagnostic log comment
}
