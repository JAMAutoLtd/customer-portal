import axios, { AxiosError } from 'axios';
import { OptimizationRequestPayload, OptimizationResponsePayload } from '../types/optimization.types';
import { GoogleAuth } from 'google-auth-library';

// Instantiate GoogleAuth
const auth = new GoogleAuth();
let idTokenClient: any = null; // Cache the IdTokenClient

/**
 * Calls the external optimization service with authentication.
 * @param payload The optimization request payload.
 * @returns The optimization response payload.
 */
export async function callOptimizationService(
  payload: OptimizationRequestPayload
): Promise<OptimizationResponsePayload> {

  const optimizeServiceUrl = process.env.OPTIMIZATION_SERVICE_URL;
  if (!optimizeServiceUrl) {
    console.error('OPTIMIZATION_SERVICE_URL environment variable is not set.');
    throw new Error('Optimization service URL is not configured.');
  }

  console.log(`Calling optimization service at: ${optimizeServiceUrl}`);

  try {
    let authHeaders = {}; // Default to empty headers

    // --- Conditionally bypass OIDC token fetch ---
    if (process.env.BYPASS_OPTIMIZER_AUTH !== 'true') {
      console.log('Fetching OIDC token for optimization service...');
      if (!idTokenClient) {
        idTokenClient = await auth.getIdTokenClient(optimizeServiceUrl);
        console.log('Initialized IdTokenClient.');
      }
      // Fetch the necessary headers, including the Authorization: Bearer token.
      // getRequestHeaders() handles token caching and refreshing.
      authHeaders = await idTokenClient.getRequestHeaders(optimizeServiceUrl);
      console.log('Successfully fetched OIDC token header.');
    } else {
      console.log('BYPASS_OPTIMIZER_AUTH=true detected. Skipping OIDC token fetch.');
    }
    // --- End Conditional Bypass ---

    // Construct the full URL with the specific endpoint path
    const fullOptimizeUrl = `${optimizeServiceUrl.replace(/\/$/, '')}/optimize-schedule`; // Remove trailing slash if exists, add endpoint
    console.log(`Posting payload to full URL: ${fullOptimizeUrl}`);

    // Make the authenticated request using axios to the full URL
    const response = await axios.post<OptimizationResponsePayload>(
      fullOptimizeUrl, // Use the constructed URL with path
      payload,
      {
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders, // Spread potentially empty authHeaders
        },
        timeout: 120000 // Keep existing timeout
      }
    );

    console.log('Optimization service call successful.');
    return response.data;

  } catch (error) {
    // --- Enhanced Error Handling --- 
    const axiosError = error as AxiosError;
    console.error('Error calling optimization service:', axiosError.message);

    // Log details if it's an Axios error with a response
    if (axiosError.response) {
      console.error('Optimization Service Response Status:', axiosError.response.status);
      console.error(
        'Optimization Service Response Data:',
        JSON.stringify(axiosError.response.data, null, 2)
      );
      throw new Error(
        `HTTP error calling optimization service: ${axiosError.response.status} - ${axiosError.message}. Check microservice logs at ${optimizeServiceUrl}`
      );
    } 
    // Log details if it's an Axios error *without* a response (e.g., network error, timeout)
    else if (axiosError.request) {
         console.error('Optimization Service Request Error:', axiosError.request);
          throw new Error(
            `Network error or no response received from optimization service: ${axiosError.message}`
          );
    }
    // Handle errors that are not from Axios (e.g., OIDC token fetch error)
    else {
        console.error('Non-Axios error during optimization call:', error); 
         throw new Error(
           `Failed during optimization service call preparation: ${ (error instanceof Error) ? error.message : String(error)}`
         );
    }
    // --- End Enhanced Error Handling ---
  }
}
