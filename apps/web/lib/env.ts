/**
 * Configuration, read once, with the two Context MCP endpoints treated as
 * optional on purpose.
 *
 * Sanity Context is an opt-in beta that an organisation admin has to enable, so
 * a checkout of this repo will not have it on day one. Rather than crash, the app
 * falls back to reading the same dataset over the ordinary client and says so in
 * the interface. A demo that silently pretends to be using Context would be
 * worse than one that admits it is not.
 */
export const env = {
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? '',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production',
  apiVersion: process.env.SANITY_API_VERSION ?? '2026-09-01',
  writeToken: process.env.SANITY_WRITE_TOKEN ?? '',

  organizationToken: process.env.SANITY_ORGANIZATION_TOKEN ?? '',
  groqMcpUrl: process.env.SANITY_CONTEXT_GROQ_URL ?? '',
  kbMcpUrl: process.env.SANITY_CONTEXT_KB_URL ?? '',

  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
}

export const hasGroqMcp = () => Boolean(env.groqMcpUrl && env.organizationToken)
export const hasKbMcp = () => Boolean(env.kbMcpUrl && env.organizationToken)
export const hasModel = () => Boolean(env.anthropicKey)

/** What the UI badge shows, so nobody has to guess which path a given answer took. */
export type ContentSource = 'context-mcp-groq' | 'direct-client'
