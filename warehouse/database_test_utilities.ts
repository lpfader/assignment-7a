import { ObjectId } from 'mongodb'
import { type ShelfId, type BookID, type OrderId } from '../adapter/assignment-4'
import { type WarehouseDatabaseAccessor } from './src/warehouse_database'

export async function seedWarehouseDatabase (
  accessor: WarehouseDatabaseAccessor,
  { books, orders, bookNames }: {
    books: Record<BookID, Record<ShelfId, number>>
    orders: Record<OrderId, Record<BookID, number>>
    bookNames?: Record<BookID, string>
  }
): Promise<void> {
  await Promise.all([
    // The warehouse's copy of which books exist (normally filled by BookAdded events)
    ...Object.entries(bookNames ?? {}).map(async ([book, name]) => {
      return await accessor.bookNames.insertOne({ _id: book, name })
    }),
    // Note: not async — returning the array of insert promises lets flatMap
    // flatten them into Promise.all above, so the inserts are actually awaited.
    ...Object.keys(books).flatMap((book) => {
      const shelves = books[book]

      return Object.keys(shelves).map(async (shelf) => {
        return await accessor.books.insertOne({ book, shelf, count: shelves[shelf] })
      })
    }),
    ...Object.keys(orders).map(async (order) => {
      const _id = ObjectId.createFromHexString(order)
      return await accessor.orders.insertOne({ _id, books: orders[order] })
    })
  ])
}

export function generateId<T> (): T {
  const id = new ObjectId()
  return id.toHexString() as T
}
