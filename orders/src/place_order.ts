import { type BookID, type OrderId } from '../../adapter/assignment-4'
import { InMemoryOrders, type OrdersData } from './orders_data'
import { type EventBus } from '../../shared/events'

// Thrown when an order includes a book the orders service has never heard of (no
// BookAdded event for it), so orders can't be placed for books that don't exist.
export class UnknownBooksError extends Error {
  constructor (bookIds: BookID[]) {
    super(`unknown book: ${bookIds.join(', ')}`)
  }
}

// With an event bus, the new order is announced (OrderPlaced) after it is saved, so
// the warehouse can keep its own copy for fulfilment.
export async function placeOrder (data: OrdersData, books: BookID[], events?: EventBus): Promise<OrderId> {
  const unknown: BookID[] = []
  for (const book of new Set(books)) {
    if (!(await data.isValidBook(book))) {
      unknown.push(book)
    }
  }
  if (unknown.length > 0) {
    throw new UnknownBooksError(unknown)
  }

  const order: Record<BookID, number> = {}

  for (const book of books) {
    order[book] = 1 + (order[book] ?? 0)
  }

  const orderId = await data.placeOrder(order)
  await events?.publish('OrderPlaced', { orderId, books: order })
  return orderId
}

if (import.meta.vitest !== undefined) {
  const { test, expect } = import.meta.vitest

  test('can place an order for a single book', async () => {
    const data = new InMemoryOrders({ validBooks: ['my_book', 'my_second_book'] })

    const orderId = await placeOrder(data, ['my_book'])

    const order = await data.getOrder(orderId)

    expect(order).toBeTruthy()

    if (order !== false) {
      expect(order).toHaveProperty('my_book')
      expect(order.my_book).toBe(1)
    }
  })

  test('can place an order for multiple books', async () => {
    const data = new InMemoryOrders({ validBooks: ['my_book', 'my_second_book'] })

    const orderId = await placeOrder(data, ['my_book', 'my_second_book'])

    const order = await data.getOrder(orderId)

    expect(order).toBeTruthy()

    if (order !== false) {
      expect(order).toHaveProperty('my_book')
      expect(order.my_book).toBe(1)
      expect(order).toHaveProperty('my_second_book')
      expect(order.my_second_book).toBe(1)
    }
  })

  test('can place an order for multiple copies of a book', async () => {
    const data = new InMemoryOrders({ validBooks: ['my_book', 'my_second_book'] })

    const orderId = await placeOrder(data, ['my_book', 'my_book', 'my_book'])

    const order = await data.getOrder(orderId)

    expect(order).toBeTruthy()

    if (order !== false) {
      expect(order).toHaveProperty('my_book')
      expect(order.my_book).toBe(3)
    }
  })

  test('an order with a book the service has never heard of is refused and not saved', async () => {
    const data = new InMemoryOrders({ validBooks: ['my_book'] })

    await expect(async () => {
      await placeOrder(data, ['my_book', 'unknown_book'])
    }).rejects.toThrowError('unknown book: unknown_book')

    expect(await data.listOrders()).toHaveLength(0)
  })
}
