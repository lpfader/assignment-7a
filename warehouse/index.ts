import server from './server'
import { connectEventBus } from './src/messaging'

// No top-level await here on purpose: it makes this file an async module, which Node 20 cannot require() when tsx runs it as CommonJS.
async function start (): Promise<void> {
  // Only the real server uses RabbitMQ. The tests call server() directly and get
  // the in-memory event bus instead, so they don't need RabbitMQ running.
  const events = await connectEventBus('warehouse')
  await server(3000, false, events)
}

void start()
