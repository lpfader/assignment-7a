import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { generateId } from '../database_test_utilities'
import { type BookID } from '../../shared/documented_types'

setup()

// The warehouse tells books every time a book's stock changes (BookStocked), with
// the new total across all shelves.

async function shelve (address: string, book: BookID, shelf: string, count: number): Promise<Response> {
  return await fetch(`${address}/warehouse/${book}/${shelf}/${count}`, { method: 'PUT' })
}

test<ServerTestContext>('stocking a shelf publishes the book\'s new total across all shelves', async ({ address, state, events }) => {
  const book = generateId<BookID>()
  await state.warehouse.saveBookName(book, 'A Book')

  await shelve(address, book, 'shelf_1', 5)
  await shelve(address, book, 'shelf_2', 3)

  expect(events.publishedOf('BookStocked')).toEqual([
    { book, totalStock: 5 },
    { book, totalStock: 8 }
  ])
})

test<ServerTestContext>('stocking a book the warehouse doesn\'t know publishes nothing', async ({ address, events }) => {
  const response = await shelve(address, generateId<BookID>(), 'shelf_1', 5)

  expect(response.status).toEqual(404)
  expect(events.published).toEqual([])
})

test<ServerTestContext>('fulfilling an order publishes the new total of each book in it', async ({ address, state, events }) => {
  const [first, second] = [generateId<BookID>(), generateId<BookID>()]
  await state.warehouse.saveBookName(first, 'First')
  await state.warehouse.saveBookName(second, 'Second')
  await shelve(address, first, 'shelf_1', 5)
  await shelve(address, second, 'shelf_1', 2)
  const orderId = await state.warehouse.placeOrder({ [first]: 2, [second]: 1 })
  events.published = []

  const response = await fetch(`${address}/fulfil/${orderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      booksFulfilled: [
        { book: first, shelf: 'shelf_1', numberOfBooks: 2 },
        { book: second, shelf: 'shelf_1', numberOfBooks: 1 }
      ]
    })
  })

  expect(response.status).toEqual(201)
  expect(events.publishedOf('BookStocked')).toEqual([
    { book: first, totalStock: 3 },
    { book: second, totalStock: 1 }
  ])
})

test<ServerTestContext>('a failed fulfilment publishes nothing', async ({ address, events }) => {
  const response = await fetch(`${address}/fulfil/${generateId<string>()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booksFulfilled: [] })
  })

  expect(response.status).toEqual(500)
  expect(events.published).toEqual([])
})

test<ServerTestContext>('GET /warehouse returns every book\'s total', async ({ address, state }) => {
  const book = generateId<BookID>()
  await state.warehouse.saveBookName(book, 'A Book')
  await shelve(address, book, 'shelf_1', 5)
  await shelve(address, book, 'shelf_2', 3)

  const totals = (await (await fetch(`${address}/warehouse`)).json()) as Record<BookID, number>

  expect(totals[book]).toEqual(8)
})
