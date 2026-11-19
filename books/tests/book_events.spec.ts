import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { generateId, seedBookDatabase } from '../database_test_utilities'
import { type Book, type BookID } from '../../shared/documented_types'

setup()

// books tells the other services about every change to the catalogue, and only
// after the change has been saved.

const newBook: Book = { name: 'Event Book', author: 'An Author', description: '', price: 5, image: '' }

async function postBook (address: string, book: Book): Promise<Response> {
  return await fetch(`${address}/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(book)
  })
}

test<ServerTestContext>('creating a book publishes BookAdded with its new id', async ({ address, events }) => {
  const response = await postBook(address, newBook)
  const { id } = (await response.json()) as { id: BookID }

  expect(events.publishedOf('BookAdded')).toEqual([{ book: { ...newBook, id } }])
  expect(events.publishedOf('BookUpdated')).toEqual([])
})

test<ServerTestContext>('updating a book publishes BookUpdated', async ({ address, state, events }) => {
  const id = generateId<BookID>()
  await seedBookDatabase(state.books, { books: { [id]: { ...newBook, id } } })

  await postBook(address, { ...newBook, id, name: 'Renamed' })

  expect(events.publishedOf('BookUpdated')).toEqual([{ book: { ...newBook, id, name: 'Renamed' } }])
  expect(events.publishedOf('BookAdded')).toEqual([])
})

test<ServerTestContext>('updating a book that does not exist publishes nothing', async ({ address, events }) => {
  const response = await postBook(address, { ...newBook, id: generateId<BookID>() })

  expect(response.status).toEqual(404)
  expect(events.published).toEqual([])
})

test<ServerTestContext>('deleting a book publishes BookRemoved, and a failed delete publishes nothing', async ({ address, state, events }) => {
  const id = generateId<BookID>()
  await seedBookDatabase(state.books, { books: { [id]: { ...newBook, id } } })

  await fetch(`${address}/books/${id}`, { method: 'DELETE' })
  const second = await fetch(`${address}/books/${id}`, { method: 'DELETE' })

  expect(second.status).toEqual(404)
  expect(events.publishedOf('BookRemoved')).toEqual([{ id }])
})
