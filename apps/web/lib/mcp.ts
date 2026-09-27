import {createMCPClient} from '@ai-sdk/mcp'
import {env, hasGroqMcp, hasKbMcp} from './env.ts'

type McpClient = Awaited<ReturnType<typeof createMCPClient>>
type ToolSet = Awaited<ReturnType<McpClient['tools']>>

const connect = (url: string): Promise<McpClient> =>
  createMCPClient({
    transport: {
      type: 'http',
      url,
      headers: {Authorization: `Bearer ${env.organizationToken}`},
    },
  })

/**
 * Both endpoints, side by side.
 *
 * Sanity derives an endpoint's mode from its sources, and if an endpoint has both
 * a dataset source and a Knowledge Base source the dataset wins and the Knowledge
 * Bases are ignored. So an agent that needs structured claims *and* indexed prose
 * needs two endpoints, not one — which is why this returns a pair.
 *
 * Tool names are namespaced on the way out because both modes expose a tool
 * called `initial_context`; merging them unprefixed would silently drop one.
 */
export interface McpBundle {
  tools: ToolSet
  clients: McpClient[]
  groqTools: ToolSet | null
  connected: {groq: boolean; kb: boolean}
  warnings: string[]
}

const prefix = (tools: ToolSet, p: string): ToolSet =>
  Object.fromEntries(Object.entries(tools).map(([name, t]) => [`${p}_${name}`, t])) as ToolSet

export async function openMcp(): Promise<McpBundle> {
  const warnings: string[] = []

  // Offline mode reads the corpus straight out of the repo, so there is no network
  // path to report on. Listing both endpoints as "not configured" here would be
  // technically true and actively misleading.
  if (env.offline) {
    return {
      tools: {} as ToolSet,
      groqTools: null,
      clients: [],
      connected: {groq: false, kb: false},
      warnings: [],
    }
  }

  let tools = {} as ToolSet
  let groqTools: ToolSet | null = null
  const clients: McpClient[] = []
  const connected = {groq: false, kb: false}

  if (hasGroqMcp()) {
    try {
      const client = await connect(env.groqMcpUrl)
      clients.push(client)
      groqTools = await client.tools()
      tools = {...tools, ...prefix(groqTools, 'content')} as ToolSet
      connected.groq = true
    } catch (e) {
      warnings.push(`GROQ-mode Context endpoint failed to connect: ${describe(e)}`)
    }
  } else {
    warnings.push('GROQ-mode Context endpoint is not configured; reading the dataset over the ordinary client instead.')
  }

  if (hasKbMcp()) {
    try {
      const client = await connect(env.kbMcpUrl)
      clients.push(client)
      tools = {...tools, ...prefix(await client.tools(), 'kb')} as ToolSet
      connected.kb = true
    } catch (e) {
      warnings.push(`Knowledge-Base-mode Context endpoint failed to connect: ${describe(e)}`)
    }
  } else {
    warnings.push('Knowledge-Base-mode Context endpoint is not configured; prose answers will be unavailable.')
  }

  return {tools, groqTools, clients, connected, warnings}
}

export const closeMcp = async (bundle: McpBundle) => {
  await Promise.allSettled(bundle.clients.map((c) => c.close()))
}

/**
 * Run one of our canonical GROQ projections through the Context endpoint.
 *
 * The endpoint's `groq_query` tool returns `{meta, result}`, but the AI SDK may
 * hand it back as a parsed object or as MCP content parts depending on how the
 * server frames it, so both shapes are unwrapped here rather than at every call
 * site.
 */
export async function groqViaMcp<T>(bundle: McpBundle, query: string): Promise<T> {
  const tool = bundle.groqTools?.groq_query
  if (!tool?.execute) throw new Error('groq_query is not available on the configured Context endpoint.')
  const raw = await tool.execute({query} as never, {toolCallId: 'internal', messages: []} as never)
  return unwrap<T>(raw)
}

function unwrap<T>(raw: unknown): T {
  let value: unknown = raw
  // MCP content envelope: {content: [{type: 'text', text: '...'}]}
  if (value && typeof value === 'object' && 'content' in value) {
    const parts = (value as {content: unknown}).content
    if (Array.isArray(parts)) {
      const text = parts
        .filter((p): p is {type: string; text: string} => !!p && typeof p === 'object' && 'text' in p)
        .map((p) => p.text)
        .join('')
      if (text) {
        try {
          value = JSON.parse(text)
        } catch {
          value = text
        }
      }
    }
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      /* leave as string */
    }
  }
  // groq_query result envelope
  if (value && typeof value === 'object' && 'result' in value) value = (value as {result: unknown}).result
  return value as T
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))
