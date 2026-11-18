import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { generateId, seedBookDatabase } from '../database_test_utilities'
import { type BookID, type Book } from '../../shared/documented_types'
import { ObjectId } from 'mongodb'

setup()

// The DELETE /books/{id} route is registered on the zod router rather than on a
// tsoa controller, so it is not part of the generated client. These tests use
// fetch directly against the running server instead.

test<ServerTestContext>('deleting a book removes it, and deleting it again is a 404', async ({ address, state }) => {
  const id = generateId<BookID>()
  const book: Book = {
    id,
    name: 'Delete Me',
    author: 'An Author',
    description: '',
    price: 1,
    image: ''
  }
  await seedBookDatabase(state.books, { books: { [id]: book } })

  const first = await fetch(`${address}/books/${id}`, { method: 'DELETE' })

  expect(first.status).toEqual(200)
  expect(await state.books.books.findOne({ _id: ObjectId.createFromHexString(id) })).toBeNull()

  const second = await fetch(`${address}/books/${id}`, { method: 'DELETE' })

  expect(second.status).toEqual(404)
})

test<ServerTestContext>('a book with unexpected extra fields is rejected', async ({ address }) => {
  const result = await fetch(`${address}/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bad Book',
      author: 'An Author',
      description: '',
      price: 1,
      image: '',
      nonsense: true
    })
  })

  expect(result.status).toBeGreaterThanOrEqual(400)
})
