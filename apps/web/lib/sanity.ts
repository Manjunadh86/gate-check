import {createClient, type SanityClient} from '@sanity/client'
import {env} from './env.ts'

/**
 * Both clients are built lazily.
 *
 * `createClient` throws if `projectId` is missing, and a throw at module scope
 * takes the whole route down before any of the app's own error handling runs —
 * including the setup screen whose entire job is to tell you the project id is
 * missing. Lazy construction keeps a misconfigured checkout diagnosable.
 */
let read: SanityClient | null = null

/** Read path, used only when Context MCP is not configured. */
export function readClient(): SanityClient {
  if (!env.projectId) {
    throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is not set, so there is nothing to read from.')
  }
  read ??= createClient({
    projectId: env.projectId,
    dataset: env.dataset,
    apiVersion: env.apiVersion,
    useCdn: false,
    perspective: 'published',
  })
  return read
}

/**
 * Write path.
 *
 * Context MCP is read-only by design, so every mutation in this app happens here,
 * server-side, after the agent has finished — the pattern Sanity's own docs
 * recommend. The agent never holds a write credential.
 */
export function writeClient(): SanityClient {
  if (!env.projectId) throw new Error('NEXT_PUBLIC_SANITY_PROJECT_ID is not set.')
  if (!env.writeToken) throw new Error('SANITY_WRITE_TOKEN is not set, so writes are disabled.')
  return createClient({
    projectId: env.projectId,
    dataset: env.dataset,
    apiVersion: env.apiVersion,
    token: env.writeToken,
    useCdn: false,
  })
}
