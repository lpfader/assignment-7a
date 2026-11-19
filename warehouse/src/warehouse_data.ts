import { ObjectId } from 'mongodb'
import { type BookID } from '../../adapter/assignment-2'
import { type OrderId, type ShelfId } from '../../adapter/assignment-4'
import { getDefaultWarehouseDatabase } from './warehouse_database'

export interface WarehouseData {
  placeBookOnShelf: (bookId: BookID, shelf: ShelfId, count: number) => Promise<void>
  getCopiesOnShelf: (bookId: BookID, shelf: ShelfId) => Promise<number>
  getCopies: (bookId: BookID) => Promise<Record<ShelfId, number>>
  getOrder: (order: OrderId) => Promise<Record<BookID, number> | false>
  placeOrder: (books: Record<BookID, number>) => Promise<OrderId>
  listOrders: () => Promise<Array<{ orderId: OrderId, books: Record<BookID, number> }>>
  removeOrder: (order: OrderId) => Promise<void>
  // The warehouse's own copy of the books that exist, kept up to date by the
  // BookAdded, BookUpdated and BookRemoved events from books.
  saveBookName: (bookId: BookID, name: string) => Promise<void>
  removeBookName: (bookId: BookID) => Promise<void>
  getBookName: (bookId: BookID) => Promise<string | false>
  countBookNames: () => Promise<number>
}

export class InMemoryWarehouse implements WarehouseData {
  books: Record<BookID, Record<ShelfId, number>>
  orders: Record<OrderId, Record<BookID, number>>
  bookNames: Record<BookID, string>

  constructor (params?: {
    books?: Record<BookID, Record<ShelfId, number>>
    orders?: Record<OrderId, Record<ShelfId, number>>
    bookNames?: Record<BookID, string>
  }) {
    const { books, orders, bookNames } = params ?? {}
    this.books = books ?? {}
    this.orders = orders ?? {}
    this.bookNames = bookNames ?? {}
  }

  async saveBookName (bookId: BookID, name: string): Promise<void> {
    this.bookNames[bookId] = name
  }

  async removeBookName (bookId: BookID): Promise<void> {
    const { [bookId]: _removed, ...rest } = this.bookNames
    this.bookNames = rest
  }

  async getBookName (bookId: BookID): Promise<string | false> {
    return this.bookNames[bookId] ?? false
  }

  async countBookNames (): Promise<number> {
    return Object.keys(this.bookNames).length
  }

  async placeBookOnShelf (bookId: string, shelf: string, count: number): Promise<void> {
    const book = this.books[bookId] ?? {}
    this.books[bookId] = { ...book, [shelf]: count }
  }

  async getCopiesOnShelf (bookId: string, shelf: string): Promise<number> {
    const book = this.books[bookId] ?? {}
    return book[shelf] ?? 0
  }

  async getCopies (bookId: string): Promise<Record<ShelfId, number>> {
    const book = this.books[bookId] ?? {}
    return book
  }

  async getOrder (order: OrderId): Promise<Record<BookID, number> | false> {
    return order in this.orders ? this.orders[order] : false
  }

  async removeOrder (order: OrderId): Promise<void> {
    const orders: Record<string, Record<BookID, number>> = {}

    for (const orderId of Object.keys(this.orders)) {
      if (orderId !== order) {
        orders[orderId] = this.orders[orderId]
      }
    }

    this.orders = orders
  }

  async listOrders (): Promise<Array<{ orderId: OrderId, books: Record<BookID, number> }>> {
    return Object.keys(this.orders).map((orderId) => {
      const books = this.orders[orderId]
      return { orderId, books }
    })
  }

  async placeOrder (books: Record<string, number>): Promise<OrderId> {
    const order = new ObjectId().toHexString()
    this.orders[order] = books
    return order
  }
}

export async function getDefaultWarehouseData (): Promise<WarehouseData> {
  return await getDefaultWarehouseDatabase()
}
