import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from '@gate-check/content-model/schema'
import {structure} from './structure.ts'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET ?? 'production'

if (!projectId) {
  throw new Error('Set SANITY_STUDIO_PROJECT_ID in apps/studio/.env — see SETUP.md step 2.')
}

export default defineConfig({
  name: 'gate-check',
  title: 'Gate Check',
  projectId,
  dataset,
  plugins: [
    structureTool({structure}),
    // Vision is left on deliberately: the submission asks judges to inspect the
    // content model, and the fastest way to do that is to run the app's own GROQ
    // queries against the live dataset from inside the Studio.
    visionTool({defaultApiVersion: '2026-09-01'}),
  ],
  schema: {types: schemaTypes},
})
