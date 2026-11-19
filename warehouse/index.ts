import server from './server'
import { connectEventBus } from './src/messaging'
import { syncBooksIfEmpty } from '../shared/initial_sync'

// No top-level await here on purpose: it makes this file an async module, which Node 20 cannot require() when tsx runs it as CommonJS.
async function start (): Promise<void> {
  // Only the real server uses RabbitMQ. The tests call server() directly and get
  // the in-memory event bus instead, so they don't need RabbitMQ running.
  const events = await connectEventBus('warehouse')
  const { state } = await server(3000, false, events)

  // First start only: copy the existing books from the books API.
  await syncBooksIfEmpty('warehouse', {
    count: async () => await state.warehouse.countBookNames(),
    save: async (id, name) => { await state.warehouse.saveBookName(id, name) }
  })
}

void start()
