import { ObjectId } from 'mongodb'
import { type ShelfId, type BookID, type OrderId } from '../adapter/assignment-4'
import { type WarehouseDatabaseAccessor } from './src/warehouse_database'

export async function seedWarehouseDatabase (
  accessor: WarehouseDatabaseAccessor,
  { books, orders }: { books: Record<BookID, Record<ShelfId, number>>, orders: Record<OrderId, Record<BookID, number>> }
): Promise<void> {
  await Promise.all([
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
