import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'

setup()

// The orders service announces each new order (OrderPlaced) so the warehouse can
// keep a copy, and removes an order when the warehouse says it was fulfilled.

async function order (address: string, books: string[]): Promise<Response> {
  return await fetch(`${address}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: books })
  })
}

test<ServerTestContext>('placing an order publishes OrderPlaced with the copies of each book', async ({ address, state, events }) => {
  await state.orders.saveBookId('book_a')
  await state.orders.saveBookId('book_b')

  const orderId = await (await order(address, ['book_a', 'book_a', 'book_b'])).text()

  expect(events.publishedOf('OrderPlaced')).toEqual([{ orderId, books: { book_a: 2, book_b: 1 } }])
})

test<ServerTestContext>('a rejected order publishes nothing', async ({ address, events }) => {
  const response = await order(address, ['made_up_book'])

  expect(response.status).toEqual(400)
  expect(events.publishedOf('OrderPlaced')).toEqual([])
})

test<ServerTestContext>('an OrderFulfilled event removes the order from the list', async ({ address, state, events }) => {
  await state.orders.saveBookId('book_a')
  const orderId = await (await order(address, ['book_a'])).text()

  await events.publish('OrderFulfilled', { orderId })

  const orders = (await (await fetch(`${address}/order`)).json()) as Array<{ orderId: string }>
  expect(orders.some((listed) => listed.orderId === orderId)).toBe(false)
})
