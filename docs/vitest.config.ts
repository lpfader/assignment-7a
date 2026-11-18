import { defineConfig } from 'vitest/config'

// No database here, so none of the MongoDB setup the API projects use.
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts']
  }
})
