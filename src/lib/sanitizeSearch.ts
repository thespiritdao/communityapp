// src/lib/sanitizeSearch.ts
// Sanitize user-supplied search text before interpolating it into PostgREST
// filter expressions (supabase `.or()`, `.ilike()`, `.in()` built from strings).
//
// PostgREST parses these operator strings itself, so raw metacharacters in user
// input can break out of the intended filter:
//   - `,`      separates OR conditions
//   - `()`     group / value-list delimiters
//   - `%` `*`  ilike wildcards
//   - `"` `'`  quoting
//   - `:` `\`  operator / escape syntax
// Stripping them keeps the value as a literal substring match and closes the
// injection surface, at the cost of not being able to *search for* those
// characters — acceptable for name/title/description search.

/** Strip PostgREST filter metacharacters from a single search term. */
export function sanitizeSearchTerm(input: string): string {
  if (!input) return '';
  return input
    .replace(/[,()%*"'\\:]/g, ' ') // neutralize filter syntax
    .replace(/\s+/g, ' ') // collapse whitespace introduced above
    .trim()
    .slice(0, 100); // bound length — no legit search needs more
}

/** Sanitize a list of terms (e.g. @mention names), dropping empties. */
export function sanitizeSearchTerms(inputs: string[]): string[] {
  return inputs.map(sanitizeSearchTerm).filter(Boolean);
}
