import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { generateId } from '../database_test_utilities'
import { type BookID } from '../../shared/documented_types'

setup()

// Moved from books/tests/api.spec.ts in V1.2.2, along with the warehouse routes.

test<ServerTestContext>('placing copies on a shelf makes them show up in the book info', async ({ address, state }) => {
  const bookId = generateId<BookID>()
  // The warehouse only stocks books it knows about (normally from a BookAdded event)
  await state.warehouse.saveBookName(bookId, 'A Book')

  const placed = await fetch(`${address}/warehouse/${bookId}/shelf_1/5`, { method: 'PUT' })

  expect(placed.status).toEqual(201)

  const info = await fetch(`${address}/warehouse/${bookId}`)

  expect(info.status).toEqual(200)
  expect(await info.json()).toEqual({ shelf_1: 5 })
})

test<ServerTestContext>('fulfilling an order takes the copies off the shelf', async ({ address, state }) => {
  const bookId = generateId<BookID>()
  await state.warehouse.saveBookName(bookId, 'A Book')

  await fetch(`${address}/warehouse/${bookId}/shelf_1/5`, { method: 'PUT' })

  // The warehouse's own copy of the order (normally from an OrderPlaced event)
  const orderId = generateId<string>()
  await state.warehouse.saveOrder(orderId, { [bookId]: 1 })

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

  expect(result.status).toEqual(404)
  expect(await result.text()).toEqual('no such order')
})

// Mistakes in the request are 400s with the reason, and change nothing.

async function stockedOrder (address: string, state: ServerTestContext['state'], copiesOnShelf: number, copiesOrdered: number): Promise<{ bookId: BookID, orderId: string }> {
  const bookId = generateId<BookID>()
  await state.warehouse.saveBookName(bookId, 'A Book')
  await fetch(`${address}/warehouse/${bookId}/shelf_1/${copiesOnShelf}`, { method: 'PUT' })
  const orderId = generateId<string>()
  await state.warehouse.saveOrder(orderId, { [bookId]: copiesOrdered })
  return { bookId, orderId }
}

async function fulfil (address: string, orderId: string, bookId: BookID, numberOfBooks: number): Promise<Response> {
  return await fetch(`${address}/fulfil/${orderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booksFulfilled: [{ book: bookId, shelf: 'shelf_1', numberOfBooks }] })
  })
}

test<ServerTestContext>('taking the wrong number of copies is a 400 with the reason', async ({ address, state }) => {
  const { bookId, orderId } = await stockedOrder(address, state, 5, 2)

  const result = await fulfil(address, orderId, bookId, 1)

  expect(result.status).toEqual(400)
  expect(await result.text()).toEqual('incorrect number of books')
  expect(await state.warehouse.getOrder(orderId)).toEqual({ [bookId]: 2 })
  expect(await (await fetch(`${address}/warehouse/${bookId}`)).json()).toEqual({ shelf_1: 5 })
})

test<ServerTestContext>('taking more copies than the shelf has is a 400 with the reason', async ({ address, state }) => {
  const { bookId, orderId } = await stockedOrder(address, state, 1, 2)

  const result = await fulfil(address, orderId, bookId, 2)

  expect(result.status).toEqual(400)
  expect(await result.text()).toEqual('not enough copies on given shelves')
  expect(await state.warehouse.getOrder(orderId)).toEqual({ [bookId]: 2 })
  expect(await (await fetch(`${address}/warehouse/${bookId}`)).json()).toEqual({ shelf_1: 1 })
})
