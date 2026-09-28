import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET ?? 'production',
  },
  // Hosted at https://gate-check.sanity.studio. Pinned so `sanity deploy` updates
  // this studio rather than prompting to create another.
  deployment: {
    appId: 'r1ckupj4sasaxru4qxyuecto',
    autoUpdates: true,
  },
})
