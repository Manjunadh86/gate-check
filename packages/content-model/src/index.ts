/**
 * The runtime-safe entry point: vocabulary and types only.
 *
 * Deliberately does NOT re-export the schema. The schema imports `sanity`, which
 * drags the entire Studio — React, styled-components, the whole editor — into
 * anything that touches this package. The resolver and the Next server routes need
 * the vocabulary and nothing else, so they get an entry point that cannot pull the
 * Studio in by accident. Studio-only code imports `@gate-check/content-model/schema`.
 */
export * from './vocabulary.ts'
export * from './types.ts'
