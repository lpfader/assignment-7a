import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { generateId } from '../database_test_utilities'
import { type BookID, type OrderId } from '../../shared/documented_types'

setup()

// The warehouse keeps its own copy of open orders from the orders service's
// OrderPlaced events, and announces OrderFulfilled when it fulfils one.

async function stockedBook (address: string, state: ServerTestContext['state'], copies: number): Promise<BookID> {
  const book = generateId<BookID>()
  await state.warehouse.saveBookName(book, 'A Book')
  await fetch(`${address}/warehouse/${book}/shelf_1/${copies}`, { method: 'PUT' })
  return book
}

async function fulfil (address: string, orderId: OrderId, book: BookID, numberOfBooks: number): Promise<Response> {
  return await fetch(`${address}/fulfil/${orderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booksFulfilled: [{ book, shelf: 'shelf_1', numberOfBooks }] })
  })
}

test<ServerTestContext>('an OrderPlaced event lets the warehouse fulfil that order, which publishes OrderFulfilled', async ({ address, state, events }) => {
  const book = await stockedBook(address, state, 5)
  const orderId = generateId<OrderId>()

  await events.publish('OrderPlaced', { orderId, books: { [book]: 2 } })
  const response = await fulfil(address, orderId, book, 2)

  expect(response.status).toEqual(201)
  expect(events.publishedOf('OrderFulfilled')).toEqual([{ orderId }])
  expect(await state.warehouse.getOrder(orderId)).toBe(false)
})

test<ServerTestContext>('the same OrderPlaced event twice is harmless', async ({ state, events }) => {
  const orderId = generateId<OrderId>()

  await events.publish('OrderPlaced', { orderId, books: { book_1: 2 } })
  await events.publish('OrderPlaced', { orderId, books: { book_1: 2 } })

  expect(await state.warehouse.getOrder(orderId)).toEqual({ book_1: 2 })
})

test<ServerTestContext>('a failed fulfilment keeps the order and publishes no OrderFulfilled', async ({ address, state, events }) => {
  const book = await stockedBook(address, state, 5)
  const orderId = generateId<OrderId>()
  await events.publish('OrderPlaced', { orderId, books: { [book]: 2 } })

  const response = await fulfil(address, orderId, book, 1)

  expect(response.status).toEqual(500)
  expect(events.publishedOf('OrderFulfilled')).toEqual([])
  expect(await state.warehouse.getOrder(orderId)).toEqual({ [book]: 2 })
})

test<ServerTestContext>('an order can only be fulfilled once', async ({ address, state, events }) => {
  const book = await stockedBook(address, state, 5)
  const orderId = generateId<OrderId>()
  await events.publish('OrderPlaced', { orderId, books: { [book]: 1 } })

  expect((await fulfil(address, orderId, book, 1)).status).toEqual(201)
  expect((await fulfil(address, orderId, book, 1)).status).toEqual(500)
  expect(events.publishedOf('OrderFulfilled')).toHaveLength(1)
  expect(await (await fetch(`${address}/warehouse/${book}`)).json()).toEqual({ shelf_1: 4 })
})
