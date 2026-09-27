/**
 * Configuration, read on access rather than captured at import time.
 *
 * Getters instead of plain values for two reasons. Next evaluates modules at build
 * time as well as at request time, and a value frozen during the build is a
 * confusing class of bug. And it means tests can point the MCP clients at a local
 * server without dynamic-import gymnastics.
 *
 * The two Context MCP endpoints are optional on purpose. Sanity Context is an
 * opt-in beta an organisation admin has to enable, so a fresh checkout will not
 * have it. Rather than crash, the app falls back to reading the same dataset over
 * the ordinary client and says so in the interface — a demo that looked identical
 * whether or not it was using Context would be a demo you could not trust.
 */
export const env = {
  get projectId() {
    return process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? ''
  },
  get dataset() {
    return process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production'
  },
  get apiVersion() {
    return process.env.SANITY_API_VERSION ?? '2026-09-01'
  },
  get writeToken() {
    return process.env.SANITY_WRITE_TOKEN ?? ''
  },
  get organizationToken() {
    return process.env.SANITY_ORGANIZATION_TOKEN ?? ''
  },
  get groqMcpUrl() {
    return process.env.SANITY_CONTEXT_GROQ_URL ?? ''
  },
  get kbMcpUrl() {
    return process.env.SANITY_CONTEXT_KB_URL ?? ''
  },
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY ?? ''
  },
  get model() {
    return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'
  },
  /**
   * Offline mode reads the seeded corpus straight out of `@gate-check/seed` instead
   * of over the network.
   *
   * It exists so the interface can be looked at in thirty seconds instead of after
   * a ten-step setup — the difference between a judge trying this and not. It is
   * the same content either way: the seed *is* the dataset. Implicit when no
   * project id is configured, because a blank setup screen teaches nobody anything.
   */
  get offline() {
    if (process.env.GATE_CHECK_OFFLINE === '0') return false
    if (process.env.GATE_CHECK_OFFLINE === '1') return true
    // Implied only when there is genuinely nowhere else to read from. Configured
    // Context endpoints are a real content source even with no project id set, and
    // an earlier version that ignored them silently disabled Context for anyone
    // who set the endpoints first — which the MCP tests caught by failing.
    return !process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !process.env.SANITY_CONTEXT_GROQ_URL
  },
}

export const hasGroqMcp = () => Boolean(env.groqMcpUrl && env.organizationToken)
export const hasKbMcp = () => Boolean(env.kbMcpUrl && env.organizationToken)
export const hasModel = () => Boolean(env.anthropicKey)

/** What the UI badge shows, so nobody has to guess which wire an answer came down. */
export type ContentSource = 'context-mcp-groq' | 'direct-client' | 'offline-fixture'
