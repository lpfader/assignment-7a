import { expect, test } from 'vitest'
import { InMemoryEventBus } from '../../shared/events'
import { EXCHANGE, RabbitEventBus, type EventChannel, type EventMessage } from '../../shared/rabbit_event_bus'

// Tests for the shared event buses in shared/. They live here because shared/ is not
// a project of its own. RabbitEventBus is tested against a fake channel that records
// what it was asked to do, so no RabbitMQ is needed.

function fakeChannel (): EventChannel & { calls: Array<[string, ...unknown[]]> } {
  const calls: Array<[string, ...unknown[]]> = []
  return {
    calls,
    assertExchange: async (...args) => { calls.push(['assertExchange', ...args]) },
    assertQueue: async (...args) => { calls.push(['assertQueue', ...args]) },
    bindQueue: async (...args) => { calls.push(['bindQueue', ...args]) },
    prefetch: async (...args) => { calls.push(['prefetch', ...args]) },
    publish: (...args) => { calls.push(['publish', ...args]); return true },
    consume: async (...args) => { calls.push(['consume', ...args]) },
    ack: (...args) => { calls.push(['ack', ...args]) },
    nack: (...args) => { calls.push(['nack', ...args]) }
  }
}

function message (routingKey: string, payload: unknown, redelivered = false): EventMessage {
  return { content: Buffer.from(JSON.stringify(payload)), fields: { routingKey, redelivered } }
}

test('the in-memory bus delivers an event to its subscribers and records it', async () => {
  const bus = new InMemoryEventBus()
  const received: unknown[] = []
  await bus.subscribe('BookRemoved', async (payload) => { received.push(payload) })

  await bus.publish('BookRemoved', { id: 'book_1' })
  await bus.publish('BookStocked', { book: 'book_1', totalStock: 3 })

  expect(received).toEqual([{ id: 'book_1' }])
  expect(bus.publishedOf('BookRemoved')).toEqual([{ id: 'book_1' }])
  expect(bus.publishedOf('BookStocked')).toEqual([{ book: 'book_1', totalStock: 3 }])
})

test('the RabbitMQ bus publishes to the shared exchange, keyed by the event name', async () => {
  const channel = fakeChannel()
  const bus = new RabbitEventBus(channel, 'books')

  await bus.publish('BookRemoved', { id: 'book_1' })

  const publish = channel.calls.find(([call]) => call === 'publish')
  expect(publish?.slice(1, 3)).toEqual([EXCHANGE, 'BookRemoved'])
  expect(JSON.parse((publish?.[3] as Buffer).toString())).toEqual({ id: 'book_1' })
  expect(publish?.[4]).toMatchObject({ persistent: true })
})

test('subscribing binds the service queue to only that event', async () => {
  const channel = fakeChannel()
  const bus = new RabbitEventBus(channel, 'warehouse')

  await bus.subscribe('BookAdded', async () => {})

  expect(channel.calls).toContainEqual(['assertQueue', 'warehouse', { durable: true }])
  expect(channel.calls).toContainEqual(['bindQueue', 'warehouse', EXCHANGE, 'BookAdded'])
})

test('a handled message is acknowledged after its handler succeeds', async () => {
  const channel = fakeChannel()
  const bus = new RabbitEventBus(channel, 'orders')
  const received: unknown[] = []
  await bus.subscribe('BookRemoved', async (payload) => { received.push(payload) })

  const msg = message('BookRemoved', { id: 'book_1' })
  await bus.handle(msg)

  expect(received).toEqual([{ id: 'book_1' }])
  expect(channel.calls).toContainEqual(['ack', msg])
})

test('a failing handler is retried once, then the message is dropped', async () => {
  const channel = fakeChannel()
  const bus = new RabbitEventBus(channel, 'orders')
  await bus.subscribe('BookRemoved', async () => { throw new Error('database down') })

  const first = message('BookRemoved', { id: 'book_1' })
  await bus.handle(first)
  const second = message('BookRemoved', { id: 'book_1' }, true)
  await bus.handle(second)

  expect(channel.calls).toContainEqual(['nack', first, false, true])
  expect(channel.calls).toContainEqual(['nack', second, false, false])
  expect(channel.calls.some(([call]) => call === 'ack')).toBe(false)
})
