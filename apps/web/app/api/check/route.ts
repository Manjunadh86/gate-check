import {NextResponse} from 'next/server'
import {runCheck} from '../../../lib/agent.ts'

export const maxDuration = 120

export async function POST(request: Request) {
  let question: string
  try {
    const body = (await request.json()) as {question?: unknown}
    if (typeof body.question !== 'string' || body.question.trim().length < 3) {
      return NextResponse.json({error: 'Send a JSON body with a "question" string.'}, {status: 400})
    }
    question = body.question.trim().slice(0, 4000)
  } catch {
    return NextResponse.json({error: 'Body must be JSON.'}, {status: 400})
  }

  try {
    return NextResponse.json(await runCheck(question))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Surfaced verbatim rather than swallowed: every failure mode here is a
    // configuration problem, and the exact message is the fix.
    return NextResponse.json({error: message}, {status: 500})
  }
}
