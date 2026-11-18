import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'

setup()

test<ServerTestContext>('placing an order returns its id and it shows up in the order list', async ({ address, state }) => {
  const placed = await fetch(`${address}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: ['book_a', 'book_a', 'book_b'] })
  })

  expect(placed.status).toEqual(201)

  const orderId = await placed.text()

  expect(await state.orders.getOrder(orderId)).toEqual({ book_a: 2, book_b: 1 })

  const list = await fetch(`${address}/order`)
  const orders = (await list.json()) as Array<{ orderId: string, books: Record<string, number> }>

  expect(orders).toEqual([{ orderId, books: { book_a: 2, book_b: 1 } }])
})
