/**
 * Display sanitizing for errors that reach the UI.
 *
 * Patch and MCP errors routinely embed a command line or a header, and those
 * carry credentials. Everything shown in the panel goes through here first.
 */
export function sanitizeError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value)
  const cleaned = text
    // Known token families, matched by their own prefix.
    .replace(/\b(glpat|xox[abposr]|AKIA|ASIA|AIza|ya29|eyJ)[A-Za-z0-9._-]{6,}/g, '$1…')
    .replace(/\b(ghp_|gho_|github_pat_|sk-)[A-Za-z0-9_-]{8,}/g, '$1…')
    // Any `something=value` / `"something": "value"` where the NAME looks like a
    // credential. Name-based, because a value has no shape to recognise.
    .replace(
      /([A-Za-z0-9_.-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth|token|secret|password|passwd|credential)[A-Za-z0-9_.-]*)(\s*[:=]\s*)(["']?)([^\s,;"'&]{4,})\3/gi,
      '$1$2$3…$3',
    )
    // Basic auth embedded in a URL: the user may stay, the password must not.
    .replace(/(\/\/[^/\s:@]+):[^/\s@]+@/g, '$1:…@')
    // `Bearer <anything>` regardless of what the token looks like.
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{6,}/gi, '$1 …')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
  // `String([])` is empty, and so is an Error with no message: an empty banner
  // tells the user nothing. Say something true instead.
  return cleaned === '' ? 'Unknown error.' : cleaned
}
