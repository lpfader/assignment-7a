import { getBookDatabase, type BookDatabaseAccessor } from '../database_access'
import { type BookID } from '../../../shared/documented_types'
import { type EventBus } from '../../../shared/events'

// books' own copy of each book's total stock across the warehouse's shelves.

export async function saveStockLevel ({ stockLevels }: BookDatabaseAccessor, book: BookID, totalStock: number): Promise<void> {
  // Upsert with the new total, so handling the same event twice is harmless.
  await stockLevels.replaceOne({ _id: book }, { totalStock }, { upsert: true })
}

export async function removeStockLevel ({ stockLevels }: BookDatabaseAccessor, book: BookID): Promise<void> {
  await stockLevels.deleteOne({ _id: book })
}

// The stock of each given book; 0 for a book with no stock record.
export async function getStockLevels ({ stockLevels }: BookDatabaseAccessor, books: BookID[]): Promise<Record<BookID, number>> {
  const levels: Record<BookID, number> = Object.fromEntries(books.map((book) => [book, 0]))
  for await (const { _id, totalStock } of stockLevels.find({ _id: { $in: books } })) {
    levels[_id] = totalStock
  }
  return levels
}

export async function countStockLevels ({ stockLevels }: BookDatabaseAccessor): Promise<number> {
  return await stockLevels.countDocuments()
}

// Keep the copy up to date with the warehouse's events.
export async function subscribeToStockEvents (events: EventBus, books: BookDatabaseAccessor): Promise<void> {
  await events.subscribe('BookStocked', async ({ book, totalStock }) => {
    await saveStockLevel(books, book, totalStock)
  })
}

if (import.meta.vitest !== undefined) {
  const { test, expect } = import.meta.vitest

  test('stock levels can be saved, replaced, read, counted and removed', async () => {
    const db = getBookDatabase()

    await saveStockLevel(db, 'book_1', 5)
    await saveStockLevel(db, 'book_1', 3)
    expect(await getStockLevels(db, ['book_1', 'book_2'])).toEqual({ book_1: 3, book_2: 0 })
    expect(await countStockLevels(db)).toEqual(1)

    await removeStockLevel(db, 'book_1')
    expect(await getStockLevels(db, ['book_1'])).toEqual({ book_1: 0 })
  })
}
