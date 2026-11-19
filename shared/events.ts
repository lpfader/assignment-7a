import { type Book, type BookID, type OrderId } from './documented_types'

// The events the services send each other through RabbitMQ, in one place so the
// service that publishes an event and the services that listen for it always agree
// on its name and contents.
//
// Events carry the new value (for example the new stock total), never a change
// like "add 3", so handling the same event twice still gives the right result.
export interface Events {
  /** books: a book was created */
  BookAdded: { book: Book & { id: BookID } }
  /** books: a book's details were changed */
  BookUpdated: { book: Book & { id: BookID } }
  /** books: a book was deleted */
  BookRemoved: { id: BookID }
  /**
   * warehouse: a book's stock changed, because copies were put on a shelf or taken
   * off for an order; its new total across all shelves
   */
  BookStocked: { book: BookID, totalStock: number }
  /** orders: an order was placed, with the number of copies of each book */
  OrderPlaced: { orderId: OrderId, books: Record<BookID, number> }
  /** warehouse: an order was fulfilled (the stock changes are sent as BookStocked) */
  OrderFulfilled: { orderId: OrderId }
}

export type EventName = keyof Events

export type EventHandler<N extends EventName> = (payload: Events[N]) => Promise<void>

// What a service uses to send and receive events. In the running stack this is
// RabbitEventBus (shared/rabbit_event_bus.ts); in the tests it is InMemoryEventBus.
export interface EventBus {
  /** Send an event to every service that listens for it. */
  publish: <N extends EventName>(name: N, payload: Events[N]) => Promise<void>
  /** Listen for an event. Call for every event before start(). */
  subscribe: <N extends EventName>(name: N, handler: EventHandler<N>) => Promise<void>
  /** Begin receiving events. Called once, after all the subscribe() calls. */
  start: () => Promise<void>
}

export interface AppEventsState {
  events: EventBus
}

// The fake event bus for tests: no RabbitMQ, and events are handled straight away,
// so a test can publish an event and check its effect on the next line. It also
// records everything published, so a test can check what a service sent.
export class InMemoryEventBus implements EventBus {
  published: Array<{ name: EventName, payload: Events[EventName] }> = []
  private readonly handlers: { [N in EventName]?: Array<EventHandler<N>> } = {}

  async publish<N extends EventName>(name: N, payload: Events[N]): Promise<void> {
    this.published.push({ name, payload })
    const handlers = this.handlers[name] ?? []
    for (const handler of handlers) {
      await handler(payload)
    }
  }

  async subscribe<N extends EventName>(name: N, handler: EventHandler<N>): Promise<void> {
    const handlers = this.handlers as Record<N, Array<EventHandler<N>> | undefined>
    handlers[name] = [...(handlers[name] ?? []), handler]
  }

  async start (): Promise<void> {}

  /** The payloads of every event of one kind published so far. */
  publishedOf<N extends EventName>(name: N): Array<Events[N]> {
    return this.published.filter((event) => event.name === name).map((event) => event.payload as Events[N])
  }
}
