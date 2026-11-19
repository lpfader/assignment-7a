import { type ShelfId, type BookID } from '../../adapter/assignment-4'
import { InMemoryWarehouse, type WarehouseData } from './warehouse_data'

// Thrown when the warehouse has never heard of a book (no BookAdded event for it),
// so stock can't be created for books that don't exist.
export class UnknownBookError extends Error {
  constructor (bookId: BookID) {
    super(`unknown book: ${bookId}`)
  }
}

export async function placeBooksOnShelf (
  data: WarehouseData,
  bookId: BookID,
  numberOfBooks: number,
  shelf: ShelfId
): Promise<void> {
  if (numberOfBooks < 0) {
    throw new Error("Can't place less than 0 books on a shelf")
  }
  if (await data.getBookName(bookId) === false) {
    throw new UnknownBookError(bookId)
  }
  const current = (await data.getCopiesOnShelf(bookId, shelf)) ?? 0
  await data.placeBookOnShelf(bookId, shelf, current + numberOfBooks)
}

if (import.meta.vitest !== undefined) {
  const { test, expect } = import.meta.vitest

  test('placing a book on a shelf with no other copies of the book results in only the placed book being there', async () => {
    const data = new InMemoryWarehouse({ bookNames: { my_book: 'My Book' } })

    await placeBooksOnShelf(data, 'my_book', 1, 'my_shelf')

    expect(await data.getCopiesOnShelf('my_book', 'my_shelf')).toBe(1)
  })

  test('placing a book on a shelf with other copies of the book results in all of them being there', async () => {
    const data = new InMemoryWarehouse({ books: { my_book: { my_shelf: 5 } }, bookNames: { my_book: 'My Book' } })

    await placeBooksOnShelf(data, 'my_book', 1, 'my_shelf')

    expect(await data.getCopiesOnShelf('my_book', 'my_shelf')).toBe(6)
  })

  test('placing a negative number of books throws an error', async () => {
    const data = new InMemoryWarehouse({ bookNames: { my_book: 'My Book' } })

    await expect(async () => {
      await placeBooksOnShelf(data, 'my_book', -1, 'my_shelf')
    }).rejects.toThrowError(/less than 0/)
  })

  test('placing a book the warehouse has never heard of throws an error and stores nothing', async () => {
    const data = new InMemoryWarehouse()

    await expect(async () => {
      await placeBooksOnShelf(data, 'unknown_book', 1, 'my_shelf')
    }).rejects.toThrowError(UnknownBookError)

    expect(await data.getCopiesOnShelf('unknown_book', 'my_shelf')).toBe(0)
  })
}
