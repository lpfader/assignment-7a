import { afterEach, beforeEach, expect, test } from 'vitest'
import { type Server } from 'http'
import server from '../server'

interface DocsTestContext {
  address: string
  instance: Server
}

beforeEach<DocsTestContext>(async (context) => {
  const { server: instance } = await server()
  const address = instance.address()
  if (address === null || typeof address === 'string') {
    throw new Error('couldnt set up server')
  }
  context.address = `http://localhost:${address.port}`
  context.instance = instance
})

afterEach<DocsTestContext>(async ({ instance }) => {
  instance.close()
})

// If a service's controllers are missing from the root tsoa.json, its paths
// drop out of the combined spec and this test fails.
test<DocsTestContext>('the docs serve one spec with every API in it', async ({ address }) => {
  const page = await fetch(`${address}/docs`)
  expect(page.status).toEqual(200)

  const spec = (await (await fetch(`${address}/docs/spec`)).json()) as { paths: Record<string, unknown> }
  const paths = Object.keys(spec.paths)

  // books
  expect(paths).toContain('/books')
  expect(paths).toContain('/books/list')
  // warehouse
  expect(paths).toContain('/warehouse/{book}')
  expect(paths).toContain('/warehouse/{book}/{shelf}/{number}')
  expect(paths).toContain('/fulfil/{order}')
  // orders
  expect(paths).toContain('/order')
})
