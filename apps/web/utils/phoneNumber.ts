/**
 * Phone number normalization utility for consistent searching
 * Handles various phone number formats and standardizes them
 */

/**
 * Normalize a phone number to a consistent format for searching
 * Removes all non-digit characters and handles country codes
 * @param phone - The phone number to normalize
 * @returns The normalized phone number string
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');
  
  // Handle country codes - assume US if 11 digits starting with 1
  if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = normalized.substring(1);
  }
  
  // Return only valid length phone numbers (10 digits for US)
  if (normalized.length === 10) {
    return normalized;
  }
  
  // Return whatever we have for partial matching
  return normalized;
}

/**
 * Format a normalized phone number for display
 * @param phone - The normalized phone number
 * @returns Formatted phone number string (e.g., "(555) 123-4567")
 */
export function formatPhoneNumber(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  
  return phone;
}

/**
 * Check if two phone numbers are equivalent after normalization
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns true if the normalized numbers match
 */
export function phoneNumbersMatch(phone1: string, phone2: string): boolean {
  return normalizePhoneNumber(phone1) === normalizePhoneNumber(phone2);
}