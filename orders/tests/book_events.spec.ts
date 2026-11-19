import { expect, test } from 'vitest'
import setup, { type ServerTestContext } from './run_server'
import { type Book, type BookID } from '../../shared/documented_types'

setup()

// The orders service keeps its own copy of the valid book ids, from books' events,
// and refuses orders for books that aren't in it.

function aBook (id: BookID): Book & { id: BookID } {
  return { id, name: 'A Book', author: 'An Author', description: '', price: 5, image: '' }
}

async function order (address: string, books: BookID[]): Promise<Response> {
  return await fetch(`${address}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order: books })
  })
}

test<ServerTestContext>('a BookAdded event lets that book be ordered', async ({ address, state, events }) => {
  await events.publish('BookAdded', { book: aBook('book_1') })

  expect(await state.orders.isValidBook('book_1')).toBe(true)
  expect((await order(address, ['book_1'])).status).toEqual(201)
})

test<ServerTestContext>('ordering a book the service never heard of is a 400 with a reason, and nothing is saved', async ({ address, state, events }) => {
  await events.publish('BookAdded', { book: aBook('book_1') })
  const before = (await state.orders.listOrders()).length

  const response = await order(address, ['book_1', 'made_up_book'])

  expect(response.status).toEqual(400)
  expect(await response.text()).toEqual('unknown book: made_up_book')
  expect(await state.orders.listOrders()).toHaveLength(before)
})

test<ServerTestContext>('after a BookRemoved event the book can no longer be ordered', async ({ address, events }) => {
  await events.publish('BookAdded', { book: aBook('book_2') })
  await events.publish('BookRemoved', { id: 'book_2' })

  expect((await order(address, ['book_2'])).status).toEqual(400)
})
