import { defineConfig } from 'vitest/config'

// Routes and the client are generated once by the root scripts (npm run generate)
// before the tests run, rather than by each project.
export default defineConfig({
  test: {
    includeSource: ['src/**/*.{js,ts}'],
    setupFiles: ['./database_test_setup.ts'],
    globalSetup: ['./global_database_install.ts'],
    watchExclude: ['build/**', 'client/**']
  }
})
