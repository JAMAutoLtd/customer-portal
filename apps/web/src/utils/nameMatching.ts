/**
 * Name matching utilities for customer search
 * Handles variations in customer names and improves search accuracy
 */

/**
 * Calculate the Levenshtein distance between two strings
 * Used for fuzzy string matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

/**
 * Calculate similarity score between two strings (0-1)
 * Higher score means more similar
 */
function similarityScore(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2)
  const maxLength = Math.max(str1.length, str2.length)

  if (maxLength === 0) return 1
  return 1 - distance / maxLength
}

/**
 * Normalize a name for comparison
 * Converts to lowercase and removes extra spaces
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Check if two names are similar enough to be considered a match
 * Uses fuzzy matching to handle typos and variations
 * @param name1 - First name
 * @param name2 - Second name
 * @param threshold - Similarity threshold (0-1), default 0.8
 * @returns true if names are similar enough
 */
export function namesAreSimilar(
  name1: string,
  name2: string,
  threshold: number = 0.8,
): boolean {
  const normalized1 = normalizeName(name1)
  const normalized2 = normalizeName(name2)

  // Exact match after normalization
  if (normalized1 === normalized2) return true

  // Check if one name contains the other (for partial name searches)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1))
    return true

  // Use fuzzy matching for similar names
  const score = similarityScore(normalized1, normalized2)
  return score >= threshold
}

/**
 * Score how well a name matches a search query
 * Returns a score from 0-100, higher is better
 */
export function nameMatchScore(name: string, query: string): number {
  const normalizedName = normalizeName(name)
  const normalizedQuery = normalizeName(query)

  // Exact match gets highest score
  if (normalizedName === normalizedQuery) return 100

  // Name starts with query
  if (normalizedName.startsWith(normalizedQuery)) return 90

  // Name contains query
  if (normalizedName.includes(normalizedQuery)) return 80

  // Fuzzy match score (0-70 range)
  const similarity = similarityScore(normalizedName, normalizedQuery)
  return Math.round(similarity * 70)
}

/**
 * Check if name matches any of the search terms
 * Useful for searching with multiple words
 */
export function nameMatchesSearchTerms(
  name: string,
  searchQuery: string,
): boolean {
  const normalizedName = normalizeName(name)
  const searchTerms = normalizeName(searchQuery)
    .split(' ')
    .filter((term) => term.length > 0)

  // All search terms must be found in the name
  return searchTerms.every((term) => normalizedName.includes(term))
}
