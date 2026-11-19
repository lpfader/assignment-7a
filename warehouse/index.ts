import server from './server'
import { connectToBroker } from './src/messaging'

// No top-level await here on purpose: it makes this file an async module, which Node 20 cannot require() when tsx runs it as CommonJS.
async function start (): Promise<void> {
  // Only the real server connects to RabbitMQ. The tests call server() directly
  // without a broker, so they don't need RabbitMQ running.
  const broker = await connectToBroker()
  await server(3000, false, broker)
}

void start()
