import { connect, type Channel } from 'amqplib'

// The RabbitMQ connection for this API. The same file is in books, warehouse and
// orders (copied, like the other per-service setup); Step 3 builds events on it.

// Every event goes through this one topic exchange. Each service will bind its own
// queue to the event names it cares about.
export const EXCHANGE = 'mcmasterful-books'

export interface Broker {
  connection: Awaited<ReturnType<typeof connect>>
  channel: Channel
}

// What the server keeps. The broker is optional so the tests, which have no
// RabbitMQ, can start the server without one.
export interface AppBrokerState {
  broker?: Broker
}

// Connect to RabbitMQ and make sure the shared exchange exists. docker-compose
// waits for RabbitMQ's health check, but it is retried here too in case it is
// slow or restarting: by default every 2 seconds for about 30 seconds.
export async function connectToBroker (
  url: string = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq',
  attempts: number = 15,
  delayMs: number = 2000
): Promise<Broker> {
  for (let attempt = 1; ; attempt++) {
    try {
      const connection = await connect(url)
      const channel = await connection.createChannel()
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
      console.log('connected to RabbitMQ')
      return { connection, channel }
    } catch (e) {
      if (attempt >= attempts) {
        throw new Error(`could not connect to RabbitMQ at ${url} after ${attempts} attempts`, { cause: e })
      }
      console.log(`RabbitMQ not ready (attempt ${attempt} of ${attempts}), retrying`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
