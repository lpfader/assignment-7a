import { ObjectId, type Collection, type Db } from 'mongodb'
import { type BookID, type OrderId, type ShelfId } from '../../adapter/assignment-4'
import { client } from './database_access'
import { type WarehouseData, InMemoryWarehouse } from './warehouse_data'
import { generateId, seedWarehouseDatabase } from '../database_test_utilities'

export interface WarehouseDatabaseAccessor {
  database: Db
  books: Collection<{ book: BookID, shelf: ShelfId, count: number }>
  orders: Collection<{ books: Record<BookID, number> }>
  // The warehouse's copy of open orders, from OrderPlaced events (above), and of which
  // books exist, from the book events. Named book_names because books holds shelf stock.
  bookNames: Collection<{ _id: BookID, name: string }>
}
export interface AppWarehouseDatabaseState {
  warehouse: WarehouseData
}

export async function getWarehouseDatabase (dbName?: string): Promise<WarehouseDatabaseAccessor> {
  const database = client.db(dbName ?? Math.floor(Math.random() * 100000).toPrecision())
  const books = database.collection<{ book: BookID, shelf: ShelfId, count: number }>('books')
  await books.createIndex({ book: 1, shelf: 1 }, { unique: true })
  const orders = database.collection<{ books: Record<BookID, number> }>('orders')
  const bookNames = database.collection<{ _id: BookID, name: string }>('book_names')

  return {
    database,
    books,
    orders,
    bookNames
  }
}

export class DatabaseWarehouse implements WarehouseData {
  accessor: WarehouseDatabaseAccessor

  constructor (accessor: WarehouseDatabaseAccessor) {
    this.accessor = accessor
  }

  async placeBookOnShelf (book: string, shelf: string, count: number): Promise<void> {
    await this.accessor.books.findOneAndReplace({ book, shelf }, { book, shelf, count }, { upsert: true })
  }

  async getCopiesOnShelf (book: string, shelf: string): Promise<number> {
    const result = await this.accessor.books.findOne({ book, shelf })
    return result !== null ? result.count : 0
  }

  async getCopies (book: string): Promise<Record<ShelfId, number>> {
    const result = this.accessor.books.find({ book })
    const copies: Record<ShelfId, number> = {}

    while (await result.hasNext()) {
      const value = await result.next()
      if (value === null) {
        break
      }
      copies[value.shelf] = value.count
    }

    return copies
  }

  async getAllTotals (): Promise<Record<BookID, number>> {
    const totals: Record<BookID, number> = {}
    const sums = this.accessor.books.aggregate<{ _id: BookID, total: number }>([
      { $group: { _id: '$book', total: { $sum: '$count' } } }
    ])
    for await (const { _id, total } of sums) {
      totals[_id] = total
    }
    return totals
  }

  async getOrder (order: OrderId): Promise<Record<BookID, number> | false> {
    const result = await this.accessor.orders.findOne({ _id: ObjectId.createFromHexString(order) })
    return result !== null ? result.books : false
  }

  async removeOrder (order: OrderId): Promise<void> {
    await this.accessor.orders.deleteOne({ _id: ObjectId.createFromHexString(order) })
  }

  async saveOrder (order: OrderId, books: Record<BookID, number>): Promise<void> {
    // Same id as in the orders service. Upsert, so handling the same event twice is
    // harmless.
    await this.accessor.orders.replaceOne({ _id: ObjectId.createFromHexString(order) }, { books }, { upsert: true })
  }

  async saveBookName (bookId: BookID, name: string): Promise<void> {
    // Upsert, so handling the same event twice is harmless.
    await this.accessor.bookNames.replaceOne({ _id: bookId }, { name }, { upsert: true })
  }

  async removeBookName (bookId: BookID): Promise<void> {
    await this.accessor.bookNames.deleteOne({ _id: bookId })
  }

  async getBookName (bookId: BookID): Promise<string | false> {
    const result = await this.accessor.bookNames.findOne({ _id: bookId })
    return result !== null ? result.name : false
  }

  async countBookNames (): Promise<number> {
    return await this.accessor.bookNames.countDocuments()
  }
}

if (import.meta.vitest !== undefined) {
  const { test, expect } = import.meta.vitest

  test('placing a book adds the book to the database', async () => {
    const memData = new InMemoryWarehouse()
    const dbData = new DatabaseWarehouse(await getWarehouseDatabase())

    const book = generateId<BookID>()
    const shelf = 'my_shelf'
    const copies = 5

    await Promise.all([memData.placeBookOnShelf(book, shelf, copies), dbData.placeBookOnShelf(book, shelf, copies)])
    const [memResult, dbResult] = await Promise.all([
      memData.getCopiesOnShelf(book, shelf),
      dbData.getCopiesOnShelf(book, shelf)
    ])

    expect(memResult).toEqual(dbResult)
    expect(dbResult).toEqual(5)
  })

  test('getting a non existant book/shelf combination returns a zero', async () => {
    const memData = new InMemoryWarehouse()
    const dbData = new DatabaseWarehouse(await getWarehouseDatabase())

    const [memResult, dbResult] = await Promise.all([
      memData.getCopiesOnShelf('book', 'shelf'),
      dbData.getCopiesOnShelf('book', 'shelf')
    ])

    expect(memResult).toEqual(dbResult)
    expect(dbResult).toEqual(0)
  })

  test('get all the copies of an existing book', async () => {
    const dbPromise = getWarehouseDatabase()
    const db = await dbPromise

    const bookId = generateId<BookID>()
    const seed = { books: { [bookId]: { shelf_1: 5, shelf_2: 3 } }, orders: {} }

    await seedWarehouseDatabase(db, seed)
    const memData = new InMemoryWarehouse(seed)
    const dbData = new DatabaseWarehouse(db)

    const [memResult, dbResult] = await Promise.all([memData.getCopies(bookId), dbData.getCopies(bookId)])

    expect(memResult.shelf_1).toEqual(dbResult.shelf_1)
    expect(dbResult.shelf_1).toEqual(5)
    expect(memResult.shelf_2).toEqual(dbResult.shelf_2)
    expect(dbResult.shelf_2).toEqual(3)
  })

  test('getting the total copies of every book across all shelves', async () => {
    const seed = { books: { book_1: { shelf_1: 5, shelf_2: 3 }, book_2: { shelf_1: 1 } }, orders: {} }
    const db = await getWarehouseDatabase()
    await seedWarehouseDatabase(db, seed)

    for (const data of [new InMemoryWarehouse(seed), new DatabaseWarehouse(db)]) {
      expect(await data.getAllTotals()).toEqual({ book_1: 8, book_2: 1 })
    }
  })

  test('book names can be saved, renamed, read, counted and removed', async () => {
    const memData = new InMemoryWarehouse()
    const dbData = new DatabaseWarehouse(await getWarehouseDatabase())
    const book = generateId<BookID>()

    for (const data of [memData, dbData]) {
      await data.saveBookName(book, 'First Name')
      await data.saveBookName(book, 'Second Name')
      expect(await data.getBookName(book)).toEqual('Second Name')
      expect(await data.countBookNames()).toEqual(1)

      await data.removeBookName(book)
      expect(await data.getBookName(book)).toBe(false)
      expect(await data.countBookNames()).toEqual(0)
    }
  })

  test('order crud works as expected', async () => {
    const db = await getWarehouseDatabase()
    const memData = new InMemoryWarehouse()
    const dbData = new DatabaseWarehouse(db)

    const order = generateId<OrderId>()

    for (const data of [memData, dbData]) {
      await data.saveOrder(order, { book: 2 })
      await data.saveOrder(order, { book: 2 })
      expect(await data.getOrder(order)).toEqual({ book: 2 })

      await data.removeOrder(order)
      expect(await data.getOrder(order)).toBe(false)
    }
  })
}

export async function getDefaultWarehouseDatabase (name?: string): Promise<WarehouseData> {
  const db = await getWarehouseDatabase(name)
  return new DatabaseWarehouse(db)
}
