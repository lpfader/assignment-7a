import { connect } from 'amqplib'
import { EXCHANGE, RabbitEventBus } from '../../shared/rabbit_event_bus'
import { type EventBus } from '../../shared/events'

// The RabbitMQ connection for this API. The same file is in books, warehouse and
// orders: it is the only part that needs the amqplib package. The event bus itself
// is shared (shared/rabbit_event_bus.ts).

// Connect to RabbitMQ and return an event bus that uses this service's own queue.
// docker-compose waits for RabbitMQ's health check, but it is retried here too in
// case it is slow or restarting: by default every 2 seconds for about 30 seconds.
export async function connectEventBus (
  queue: string,
  url: string = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq',
  attempts: number = 15,
  delayMs: number = 2000
): Promise<EventBus> {
  for (let attempt = 1; ; attempt++) {
    try {
      const connection = await connect(url)
      const channel = await connection.createChannel()
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
      console.log('connected to RabbitMQ')
      return new RabbitEventBus(channel, queue)
    } catch (e) {
      if (attempt >= attempts) {
        throw new Error(`could not connect to RabbitMQ at ${url} after ${attempts} attempts`, { cause: e })
      }
      console.log(`RabbitMQ not ready (attempt ${attempt} of ${attempts}), retrying`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
