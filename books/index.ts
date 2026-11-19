import server from './server'
import { connectEventBus } from './src/messaging'
import { syncStockIfEmpty } from '../shared/initial_sync'
import { countStockLevels, saveStockLevel } from './src/books/stock'

// No top-level await here on purpose: it makes this file an async module, which Node 20 cannot require() when tsx runs it as CommonJS.
async function start (): Promise<void> {
  // Only the real server uses RabbitMQ. The tests call server() directly and get
  // the in-memory event bus instead, so they don't need RabbitMQ running.
  const events = await connectEventBus('books')
  const { state } = await server(3000, false, events)

  // First start only: copy the existing stock totals from the warehouse API.
  await syncStockIfEmpty('books', {
    count: async () => await countStockLevels(state.books),
    save: async (id, totalStock) => { await saveStockLevel(state.books, id, totalStock) }
  })
}

void start()
