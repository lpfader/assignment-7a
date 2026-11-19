import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { generateId, seedBookDatabase } from '../database_test_utilities'
import { type Book, type BookID, type BookWithStock } from '../../shared/documented_types'
import { syncStockIfEmpty } from '../../shared/initial_sync'
import { countStockLevels, getStockLevels, saveStockLevel } from '../src/books/stock'

setup()

// books keeps its own copy of each book's total stock, from the warehouse's
// BookStocked events, and shows it in the book list and book details.

const aBook: Book = { name: 'Stock Book', author: 'An Author', description: '', price: 5, image: '' }

async function list (address: string): Promise<BookWithStock[]> {
  const response = await fetch(`${address}/books/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '[]'
  })
  return (await response.json()) as BookWithStock[]
}

test<ServerTestContext>('a BookStocked event shows up as stock in the list and the book details', async ({ address, state, events }) => {
  const id = generateId<BookID>()
  await seedBookDatabase(state.books, { books: { [id]: { ...aBook, id } } })

  await events.publish('BookStocked', { book: id, totalStock: 7 })

  expect((await list(address)).find((book) => book.id === id)?.stock).toEqual(7)
  expect(((await (await fetch(`${address}/books/${id}`)).json()) as BookWithStock).stock).toEqual(7)
})

test<ServerTestContext>('a book with no stock record shows 0', async ({ address, state }) => {
  const id = generateId<BookID>()
  await seedBookDatabase(state.books, { books: { [id]: { ...aBook, id } } })

  expect((await list(address)).find((book) => book.id === id)?.stock).toEqual(0)
})

test<ServerTestContext>('editing a book keeps its stock', async ({ address, state, events }) => {
  const id = generateId<BookID>()
  await seedBookDatabase(state.books, { books: { [id]: { ...aBook, id } } })
  await events.publish('BookStocked', { book: id, totalStock: 4 })

  await fetch(`${address}/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...aBook, id, name: 'Renamed' })
  })

  const book = (await list(address)).find((book) => book.id === id)
  expect(book?.name).toEqual('Renamed')
  expect(book?.stock).toEqual(4)
})

test<ServerTestContext>('deleting a book removes its stock record', async ({ address, state, events }) => {
  const id = generateId<BookID>()
  await seedBookDatabase(state.books, { books: { [id]: { ...aBook, id } } })
  await events.publish('BookStocked', { book: id, totalStock: 4 })

  await fetch(`${address}/books/${id}`, { method: 'DELETE' })

  expect(await state.books.stockLevels.findOne({ _id: id })).toBeNull()
})

test<ServerTestContext>('the stock initial sync fills an empty copy, and only when empty', async ({ state }) => {
  const copy = {
    count: async () => await countStockLevels(state.books),
    save: async (id: BookID, totalStock: number) => { await saveStockLevel(state.books, id, totalStock) }
  }
  let requests = 0
  const fetchStock = async (): Promise<Record<BookID, number>> => {
    requests++
    return { book_1: 8, book_2: 0 }
  }
  await state.books.stockLevels.deleteMany({})

  expect(await syncStockIfEmpty('books', copy, fetchStock)).toEqual(2)
  expect(await getStockLevels(state.books, ['book_1', 'book_2'])).toEqual({ book_1: 8, book_2: 0 })

  expect(await syncStockIfEmpty('books', copy, fetchStock)).toEqual(0)
  expect(requests).toEqual(1)
})
