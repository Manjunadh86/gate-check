/**
 * A minimal MCP server that impersonates a Sanity Context endpoint.
 *
 * Exists because the agent's most fragile seam — two endpoints whose tool names
 * collide, and a `groq_query` result wrapped in two layers of envelope — could not
 * otherwise be exercised without an organisation token and a beta feature flag.
 * This is not a mock of our own code; it speaks JSON-RPC over Streamable HTTP and
 * the real client talks to it unmodified.
 *
 * Test-only. Never imported by the app.
 */
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'

export type Mode = 'groq' | 'knowledge_base'

const TOOLS: Record<Mode, {name: string; description: string; inputSchema: unknown}[]> = {
  // Both modes expose `initial_context`. That collision is the whole reason the
  // real client namespaces tool names, so the fake server reproduces it exactly.
  groq: [
    {name: 'initial_context', description: 'Compressed schema overview.', inputSchema: {type: 'object', properties: {}}},
    {
      name: 'schema_explorer',
      description: 'Detail for one type.',
      inputSchema: {type: 'object', properties: {type: {type: 'string'}}, required: ['type']},
    },
    {
      name: 'groq_query',
      description: 'Run a GROQ query.',
      inputSchema: {type: 'object', properties: {query: {type: 'string'}}, required: ['query']},
    },
  ],
  knowledge_base: [
    {name: 'initial_context', description: 'Knowledge Base outline.', inputSchema: {type: 'object', properties: {}}},
    {
      name: 'knowledge_base_read',
      description: 'Read entries by path.',
      inputSchema: {
        type: 'object',
        properties: {knowledgeBase: {type: 'string'}, paths: {type: 'array', items: {type: 'string'}}},
        required: ['knowledgeBase', 'paths'],
      },
    },
  ],
}

export interface FakeContextServer {
  url: string
  /** Every Authorization header the client sent, so the test can assert on auth. */
  authHeaders: string[]
  /** Every GROQ query the client ran. */
  queries: string[]
  close: () => Promise<void>
}

/**
 * @param mode           which tool set to serve
 * @param resolveQuery   what `groq_query` should return for a given query string
 */
export async function startFakeContextServer(
  mode: Mode,
  resolveQuery: (query: string) => unknown = () => [],
): Promise<FakeContextServer> {
  const authHeaders: string[] = []
  const queries: string[] = []

  const server: Server = createServer((req, res) => {
    if (req.headers.authorization) authHeaders.push(req.headers.authorization)

    if (req.method !== 'POST') {
      // A server that does not offer a standalone SSE stream answers GET with 405,
      // which the spec permits and the client must tolerate.
      res.writeHead(405).end()
      return
    }

    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let msg: {id?: number | string; method?: string; params?: Record<string, unknown>}
      try {
        msg = JSON.parse(body)
      } catch {
        res.writeHead(400).end()
        return
      }

      // Notifications carry no id and expect no body.
      if (msg.id === undefined) {
        res.writeHead(202).end()
        return
      }

      const reply = (result: unknown) => {
        res.writeHead(200, {'content-type': 'application/json', 'mcp-session-id': 'fake-session'})
        res.end(JSON.stringify({jsonrpc: '2.0', id: msg.id, result}))
      }

      switch (msg.method) {
        case 'initialize':
          reply({
            protocolVersion: '2025-06-18',
            capabilities: {tools: {}},
            serverInfo: {name: `fake-sanity-context-${mode}`, version: '1.0.0'},
          })
          return

        case 'tools/list':
          reply({tools: TOOLS[mode]})
          return

        case 'tools/call': {
          const name = msg.params?.name as string
          const args = (msg.params?.arguments ?? {}) as Record<string, unknown>

          if (name === 'groq_query') {
            const query = String(args.query ?? '')
            queries.push(query)
            // The real endpoint wraps results in {meta, result} and then in an MCP
            // text content part. Both layers are reproduced so the unwrapping in
            // lib/mcp.ts is genuinely under test.
            reply({
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({meta: {ms: 3, cached: false}, result: resolveQuery(query)}),
                },
              ],
            })
            return
          }

          reply({content: [{type: 'text', text: `${mode}:${name} called`}]})
          return
        }

        default:
          res.writeHead(200, {'content-type': 'application/json'})
          res.end(JSON.stringify({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'Method not found'}}))
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const {port} = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    authHeaders,
    queries,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
