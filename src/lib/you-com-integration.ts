/**
 * You.com integration for Scout
 *
 * Usage:
 * - Fallback when seed crawl returns weak results
 * - Targeted search for low-confidence attributes in digDeeper
 *
 * Setup:
 * 1. npm install @you-com/sdk
 * 2. Set YOU_API_KEY in .env
 * 3. Import and use searchWithYou() or searchForAttribute()
 */
 
import type { Page } from "./scout/research.functions" // Reuse your Page type
 
const YOU_API_KEY = process.env.YOU_API_KEY
if (!YOU_API_KEY) {
  console.warn(
    "YOU_API_KEY not set. You.com search will be unavailable. Set it in .env to enable."
  )
}
 
interface YouSearchResult {
  url: string
  title: string
  snippet: string
}
 
interface YouSearchResponse {
  results: YouSearchResult[]
}
 
/**
 * Search You.com for documentation about a competitor + feature area.
 * Returns pages with text already extracted (no need for separate fetch).
 *
 * Usage:
 * ```
 * const pages = await searchWithYou("Linear", "issue comments")
 * // Returns ~10-15 pages from Linear's help/docs
 * ```
 */
export async function searchWithYou(
  competitorName: string,
  featureArea: string,
  limit = 15
): Promise<Page[]> {
  if (!YOU_API_KEY) {
    console.warn("YOU_API_KEY not configured, skipping You.com search")
    return []
  }
 
  try {
    // Query strategy: documentation-focused
    // "Linear" "issue comments" site:linear.com OR site:help.linear.com
    const query = `${competitorName} ${featureArea} (site:help.${domainFor(competitorName)} OR site:docs.${domainFor(competitorName)} OR ${competitorName} help)`
 
    console.log(`[You.com] Searching: "${query}"`)
 
    const response = await fetch("https://api.ydc.you.com/search", {
      method: "POST",
      headers: {
        "X-API-Key": YOU_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        num_web_results: limit,
        // You.com has "research" mode that prioritizes documentation
        search_type: "research",
      }),
    })
 
    if (!response.ok) {
      console.error(`You.com API error: ${response.status} ${response.statusText}`)
      return []
    }
 
    const data: YouSearchResponse = await response.json()
 
    // Convert You.com results to Page format
    return data.results
      .filter((r) => {
        // Skip common junk patterns
        if (
          /login|signin|sign-up|signup|pricing\/?$|careers|jobs|legal|privacy|terms|cookie|forum|blog\/(tag|author|category)/i.test(
            r.url
          )
        ) {
          return false
        }
        // Strongly prefer help/docs URLs
        if (/\/(help|docs|guide|documentation|kb|learn|features|product|changelog)\//i.test(r.url)) {
          return true
        }
        // Accept feature-specific URLs
        if (/\/features?\//i.test(r.url)) {
          return true
        }
        // Accept release notes / changelog
        if (/\/(release|changelog|updates|whats-new)\//i.test(r.url)) {
          return true
        }
        // Be conservative: skip everything else to avoid noise
        return false
      })
      .slice(0, limit)
      .map((r) => ({
        url: r.url,
        // Combine title + snippet as page text
        // You.com already extracted this, so it's clean
        text: `${r.title}\n\n${r.snippet}`,
        html: "", // You.com doesn't return HTML
        ok: true,
      }))
  } catch (error) {
    console.error("You.com search failed:", error)
    return []
  }
}
 
/**
 * Targeted search for a specific attribute on a competitor's site.
 * More focused than general search.
 *
 * Usage in digDeeper:
 * ```
 * const pages = await searchForAttribute(
 *   "Linear",
 *   "comment threading",
 *   "Can you nest replies in comments? Do they support multi-level threads?"
 * )
 * ```
 */
export async function searchForAttribute(
  competitorName: string,
  attributeLabel: string,
  attributeDescription?: string
): Promise<Page[]> {
  if (!YOU_API_KEY) {
    return []
  }
 
  try {
    // More specific query: "Linear" "comment threading" documentation
    const query = `"${competitorName}" "${attributeLabel}" ${attributeDescription || ""} help documentation OR guide OR tutorial`.trim()
 
    console.log(`[You.com] Attribute search: "${query}"`)
 
    const response = await fetch("https://api.ydc.you.com/search", {
      method: "POST",
      headers: {
        "X-API-Key": YOU_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        num_web_results: 10,
        search_type: "research",
      }),
    })
 
    if (!response.ok) {
      return []
    }
 
    const data: YouSearchResponse = await response.json()
 
    return data.results
      .filter((r) => {
        // Same filtering as searchWithYou, but stricter
        return /\/(help|docs|guide|feature|changelog|release|product)\//i.test(r.url)
      })
      .slice(0, 8)
      .map((r) => ({
        url: r.url,
        text: `${r.title}\n\n${r.snippet}`,
        html: "",
        ok: true,
      }))
  } catch (error) {
    console.error("You.com attribute search failed:", error)
    return []
  }
}
 
/**
 * Helper: extract domain from company name
 * "Linear" → "linear.com"
 * "Intercom" → "intercom.com"
 * "Height" → "height.app"
 */
function domainFor(competitorName: string): string {
  const name = competitorName.toLowerCase().replace(/\s+/g, "")
  // Common TLDs - in practice you'd want to look this up
  // For now, assume .com and try .app for known companies
  if (["height", "linear"].includes(name)) {
    return name === "linear" ? "linear.app" : `${name}.app`
  }
  return `${name}.com`
}
 
/**
 * Integration helper: use You.com to supplement weak seed crawls
 *
 * Usage in crawlFromSeed:
 * ```
 * const { seed, children } = await crawlFromSeed(seedUrl, keywords)
 * if (children.length < 3) {
 *   // Seeds produced weak results, use You.com
 *   const youResults = await supplementWithYouSearch(competitorName, featureArea)
 *   children.push(...youResults)
 * }
 * ```
 */
export async function supplementWithYouSearch(
  competitorName: string,
  featureArea: string,
  minResults = 5
): Promise<Page[]> {
  const results = await searchWithYou(competitorName, featureArea)
  if (results.length >= minResults) {
    console.log(`[You.com] Found ${results.length} pages for ${competitorName}`)
  } else {
    console.warn(
      `[You.com] Only found ${results.length} pages (wanted ${minResults})`
    )
  }
  return results
}
 
export const YOU_COM_CONFIG = {
  isConfigured: !!YOU_API_KEY,
  searchTimeout: 10000, // ms
  maxRetries: 2,
  backoffMs: 1000,
}
 