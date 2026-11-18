import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { generateId } from '../database_test_utilities'
import { type BookID } from '../../shared/documented_types'

setup()

// Moved from books/tests/api.spec.ts in V1.2.2, along with the warehouse routes.

test<ServerTestContext>('placing copies on a shelf makes them show up in the book info', async ({ address }) => {
  const bookId = generateId<BookID>()

  const placed = await fetch(`${address}/warehouse/${bookId}/shelf_1/5`, { method: 'PUT' })

  expect(placed.status).toEqual(201)

  const info = await fetch(`${address}/warehouse/${bookId}`)

  expect(info.status).toEqual(200)
  expect(await info.json()).toEqual({ shelf_1: 5 })
})

test<ServerTestContext>('fulfilling an order takes the copies off the shelf', async ({ address, state }) => {
  const bookId = generateId<BookID>()

  await fetch(`${address}/warehouse/${bookId}/shelf_1/5`, { method: 'PUT' })

  // The /order routes live in the orders API now, so the order is added straight
  // into the shared database rather than through POST /order.
  const orderId = await state.warehouse.placeOrder({ [bookId]: 1 })

  const fulfilled = await fetch(`${address}/fulfil/${orderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booksFulfilled: [{ book: bookId, shelf: 'shelf_1', numberOfBooks: 1 }] })
  })

  expect(fulfilled.status).toEqual(201)

  const info = await fetch(`${address}/warehouse/${bookId}`)

  expect(await info.json()).toEqual({ shelf_1: 4 })

  expect(await state.warehouse.getOrder(orderId)).toBe(false)
})

test<ServerTestContext>('fulfilling an order that does not exist is an error', async ({ address }) => {
  const missingOrder = generateId<BookID>()

  const result = await fetch(`${address}/fulfil/${missingOrder}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booksFulfilled: [] })
  })

  expect(result.status).toEqual(500)
})
