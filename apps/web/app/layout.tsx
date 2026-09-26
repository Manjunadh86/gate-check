import type {Metadata} from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gate Check — cabin baggage and battery rules, per segment',
  description:
    'An agent that answers cabin-baggage and lithium-battery questions for one itinerary at a time, from sourced claims held in Sanity and read through Sanity Context MCP.',
}

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
