import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { generateId } from '../database_test_utilities'
import { type Book, type BookID } from '../../shared/documented_types'
import { syncBooksIfEmpty } from '../../shared/initial_sync'
import { InMemoryWarehouse } from '../src/warehouse_data'

setup()

// The warehouse keeps its own copy of which books exist, from books' events, and
// refuses to stock books that aren't in it.

function aBook (id: BookID, name = 'A Book'): Book & { id: BookID } {
  return { id, name, author: 'An Author', description: '', price: 5, image: '' }
}

async function shelve (address: string, book: BookID): Promise<Response> {
  return await fetch(`${address}/warehouse/${book}/shelf_1/2`, { method: 'PUT' })
}

test<ServerTestContext>('a BookAdded event lets the warehouse stock that book', async ({ address, state, events }) => {
  const id = generateId<BookID>()

  await events.publish('BookAdded', { book: aBook(id) })

  expect(await state.warehouse.getBookName(id)).toEqual('A Book')
  expect((await shelve(address, id)).status).toEqual(201)
})

test<ServerTestContext>('a BookUpdated event renames the book', async ({ state, events }) => {
  const id = generateId<BookID>()

  await events.publish('BookAdded', { book: aBook(id) })
  await events.publish('BookUpdated', { book: aBook(id, 'New Name') })

  expect(await state.warehouse.getBookName(id)).toEqual('New Name')
})

test<ServerTestContext>('stocking a book the warehouse never heard of is a 404 with a reason', async ({ address }) => {
  const id = generateId<BookID>()

  const response = await shelve(address, id)

  expect(response.status).toEqual(404)
  expect(await response.text()).toEqual(`unknown book: ${id}`)
  expect(await (await fetch(`${address}/warehouse/${id}`)).json()).toEqual({})
})

test<ServerTestContext>('after a BookRemoved event the book can no longer be stocked, but its stock stays', async ({ address, events }) => {
  const id = generateId<BookID>()
  await events.publish('BookAdded', { book: aBook(id) })
  await shelve(address, id)

  await events.publish('BookRemoved', { id })

  expect((await shelve(address, id)).status).toEqual(404)
  expect(await (await fetch(`${address}/warehouse/${id}`)).json()).toEqual({ shelf_1: 2 })
})

test('the initial sync fills an empty copy from the books API, and only when empty', async () => {
  const data = new InMemoryWarehouse()
  const copy = {
    count: async () => await data.countBookNames(),
    save: async (id: BookID, name: string) => { await data.saveBookName(id, name) }
  }
  let requests = 0
  const fetchBooks = async (): Promise<Array<{ id: BookID, name: string }>> => {
    requests++
    return [{ id: 'book_1', name: 'One' }, { id: 'book_2', name: 'Two' }]
  }

  expect(await syncBooksIfEmpty('warehouse', copy, fetchBooks)).toEqual(2)
  expect(await data.getBookName('book_2')).toEqual('Two')

  expect(await syncBooksIfEmpty('warehouse', copy, fetchBooks)).toEqual(0)
  expect(requests).toEqual(1)
})

test('a failed initial sync is logged, not thrown', async () => {
  const data = new InMemoryWarehouse()
  const copy = { count: async () => 0, save: async (id: BookID, name: string) => { await data.saveBookName(id, name) } }

  const synced = await syncBooksIfEmpty('warehouse', copy, async () => { throw new Error('books is down') })

  expect(synced).toEqual(0)
})
