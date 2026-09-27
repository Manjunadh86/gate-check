import type {NextConfig} from 'next'

const config: NextConfig = {
  // The workspace packages ship TypeScript sources rather than a build step, so
  // Next compiles them as part of the app. One fewer build artefact to keep in
  // sync, and the schema stays the single source of truth for Studio and app alike.
  transpilePackages: ['@gate-check/content-model', '@gate-check/resolver', '@gate-check/seed'],
  typedRoutes: false,

  // Next blocks cross-origin requests to its dev resources by default, which means
  // hitting the dev server on 127.0.0.1 or a LAN address leaves the page rendered
  // but never hydrated — the interface looks fine and no button works. Allowing the
  // loopback and private ranges makes "open it on my phone" work the way people
  // expect. Dev only; it has no effect on a production build.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.*.*', '10.*.*.*'],
}

export default config
