import { type EventBus, type EventHandler, type EventName, type Events } from './events'

// The event bus used in the running stack, on top of a RabbitMQ channel.
//
// Every event goes through one topic exchange, with the event's name as the routing
// key. Each service has its own durable queue (named after the service), bound to
// only the event names it subscribes to, so:
// - each service gets its own copy of every event it cares about, and
// - events sent while a service is down wait in its queue until it is back.
//
// A message is only removed (acked) after its handler succeeds. If a handler fails,
// the message is put back once to retry; if it fails again it is logged and dropped,
// so one bad message can't block the queue forever.

// Only the parts of an amqplib Channel this file uses. Declaring them here keeps
// shared/ free of npm packages; the channel from amqplib matches this shape, with
// amqplib's own message type as M.
export interface EventChannel<M extends EventMessage = EventMessage> {
  assertExchange: (exchange: string, type: string, options?: { durable?: boolean }) => Promise<unknown>
  assertQueue: (queue: string, options?: { durable?: boolean }) => Promise<unknown>
  bindQueue: (queue: string, source: string, pattern: string) => Promise<unknown>
  prefetch: (count: number) => Promise<unknown>
  publish: (exchange: string, routingKey: string, content: Buffer, options?: { persistent?: boolean, contentType?: string }) => boolean
  consume: (queue: string, onMessage: (message: M | null) => void) => Promise<unknown>
  ack: (message: M) => void
  nack: (message: M, allUpTo?: boolean, requeue?: boolean) => void
}

export interface EventMessage {
  content: Buffer
  fields: { routingKey: string, redelivered: boolean }
}

export const EXCHANGE = 'mcmasterful-books'

export class RabbitEventBus<M extends EventMessage = EventMessage> implements EventBus {
  private readonly handlers: { [N in EventName]?: EventHandler<N> } = {}

  /**
   * @param channel An open channel to RabbitMQ
   * @param queue This service's queue name, e.g. 'warehouse'
   */
  constructor (private readonly channel: EventChannel<M>, private readonly queue: string) {}

  async publish<N extends EventName>(name: N, payload: Events[N]): Promise<void> {
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true })
    this.channel.publish(EXCHANGE, name, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json'
    })
  }

  async subscribe<N extends EventName>(name: N, handler: EventHandler<N>): Promise<void> {
    ;(this.handlers as Record<N, EventHandler<N>>)[name] = handler
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true })
    await this.channel.assertQueue(this.queue, { durable: true })
    await this.channel.bindQueue(this.queue, EXCHANGE, name)
  }

  async start (): Promise<void> {
    await this.channel.assertQueue(this.queue, { durable: true })
    // Handle one message at a time, in order.
    await this.channel.prefetch(1)
    await this.channel.consume(this.queue, (message) => {
      if (message !== null) {
        void this.handle(message)
      }
    })
  }

  // Exposed for the tests, which call it with a fake message.
  async handle (message: M): Promise<void> {
    const name = message.fields.routingKey as EventName
    const handler = this.handlers[name] as EventHandler<EventName> | undefined
    try {
      if (handler === undefined) {
        throw new Error(`no handler for ${name}`)
      }
      await handler(JSON.parse(message.content.toString()) as Events[EventName])
      this.channel.ack(message)
    } catch (e) {
      const retry = !message.fields.redelivered
      console.error(`[${this.queue}] failed to handle ${name}, ${retry ? 'retrying once' : 'dropping it'}`, e)
      this.channel.nack(message, false, retry)
    }
  }
}
