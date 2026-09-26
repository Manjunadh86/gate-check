import type {NextConfig} from 'next'

const config: NextConfig = {
  // The workspace packages ship TypeScript sources rather than a build step, so
  // Next compiles them as part of the app. One fewer build artefact to keep in
  // sync, and the schema stays the single source of truth for Studio and app alike.
  transpilePackages: ['@gate-check/content-model', '@gate-check/resolver'],
  typedRoutes: false,
}

export default config
