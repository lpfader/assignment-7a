import { ObjectId, type Collection, type Db } from 'mongodb'
import { type BookID, type OrderId } from '../../adapter/assignment-4'
import { client } from './database_access'

// The orders service's data, in its own database (on the orders-db server). The
// warehouse keeps its own copy of open orders from OrderPlaced events, and tells
// this service when an order is fulfilled (OrderFulfilled), which removes it here.

export interface OrdersData {
  getOrder: (order: OrderId) => Promise<Record<BookID, number> | false>
  placeOrder: (books: Record<BookID, number>) => Promise<OrderId>
  listOrders: () => Promise<Array<{ orderId: OrderId, books: Record<BookID, number> }>>
  removeOrder: (order: OrderId) => Promise<void>
  // The orders service's own copy of which book ids are valid, kept up to date by
  // the BookAdded and BookRemoved events from books.
  saveBookId: (bookId: BookID) => Promise<void>
  removeBookId: (bookId: BookID) => Promise<void>
  isValidBook: (bookId: BookID) => Promise<boolean>
  countValidBooks: () => Promise<number>
}

export interface AppOrdersDatabaseState {
  orders: OrdersData
}

export class InMemoryOrders implements OrdersData {
  orders: Record<OrderId, Record<BookID, number>>
  validBooks: Set<BookID>

  constructor (params?: { orders?: Record<OrderId, Record<BookID, number>>, validBooks?: BookID[] }) {
    this.orders = params?.orders ?? {}
    this.validBooks = new Set(params?.validBooks ?? [])
  }

  async saveBookId (bookId: BookID): Promise<void> {
    this.validBooks.add(bookId)
  }

  async removeBookId (bookId: BookID): Promise<void> {
    this.validBooks.delete(bookId)
  }

  async isValidBook (bookId: BookID): Promise<boolean> {
    return this.validBooks.has(bookId)
  }

  async countValidBooks (): Promise<number> {
    return this.validBooks.size
  }

  async getOrder (order: OrderId): Promise<Record<BookID, number> | false> {
    return order in this.orders ? this.orders[order] : false
  }

  async listOrders (): Promise<Array<{ orderId: OrderId, books: Record<BookID, number> }>> {
    return Object.keys(this.orders).map((orderId) => ({ orderId, books: this.orders[orderId] }))
  }

  async removeOrder (order: OrderId): Promise<void> {
    const { [order]: _removed, ...rest } = this.orders
    this.orders = rest
  }

  async placeOrder (books: Record<BookID, number>): Promise<OrderId> {
    const order = new ObjectId().toHexString()
    this.orders[order] = books
    return order
  }
}

export class DatabaseOrders implements OrdersData {
  orders: Collection<{ books: Record<BookID, number> }>
  // The orders service's copy of the valid book ids, from the book events.
  validBooks: Collection<{ _id: BookID }>

  constructor (database: Db) {
    this.orders = database.collection<{ books: Record<BookID, number> }>('orders')
    this.validBooks = database.collection<{ _id: BookID }>('valid_books')
  }

  async saveBookId (bookId: BookID): Promise<void> {
    // Upsert, so handling the same event twice is harmless.
    await this.validBooks.replaceOne({ _id: bookId }, { _id: bookId }, { upsert: true })
  }

  async removeBookId (bookId: BookID): Promise<void> {
    await this.validBooks.deleteOne({ _id: bookId })
  }

  async isValidBook (bookId: BookID): Promise<boolean> {
    return (await this.validBooks.findOne({ _id: bookId })) !== null
  }

  async countValidBooks (): Promise<number> {
    return await this.validBooks.countDocuments()
  }

  async getOrder (order: OrderId): Promise<Record<BookID, number> | false> {
    const result = await this.orders.findOne({ _id: ObjectId.createFromHexString(order) })
    return result !== null ? result.books : false
  }

  async listOrders (): Promise<Array<{ orderId: OrderId, books: Record<BookID, number> }>> {
    const result = await this.orders.find().toArray()
    return result.map(({ _id, books }) => ({ orderId: _id.toHexString(), books }))
  }

  async removeOrder (order: OrderId): Promise<void> {
    await this.orders.deleteOne({ _id: ObjectId.createFromHexString(order) })
  }

  async placeOrder (books: Record<BookID, number>): Promise<OrderId> {
    const result = await this.orders.insertOne({ books })
    return result.insertedId.toHexString()
  }
}

export function getOrdersDatabase (dbName?: string): OrdersData {
  return new DatabaseOrders(client.db(dbName ?? Math.floor(Math.random() * 100000).toPrecision()))
}

if (import.meta.vitest !== undefined) {
  const { test, expect } = import.meta.vitest

  test('in-memory and database orders behave the same', async () => {
    const memData = new InMemoryOrders()
    const dbData = getOrdersDatabase()

    const [memOrderId, dbOrderId] = await Promise.all([memData.placeOrder({ book: 2 }), dbData.placeOrder({ book: 2 })])
    const [memOrder, dbOrder] = await Promise.all([memData.getOrder(memOrderId), dbData.getOrder(dbOrderId)])

    expect(memOrder).toMatchObject(dbOrder)
    expect(dbOrder).toEqual({ book: 2 })

    const [memList, dbList] = await Promise.all([memData.listOrders(), dbData.listOrders()])
    expect(memList.length).toEqual(dbList.length)
    expect(dbList.length).toEqual(1)
  })

  test('orders can be removed, and removing one twice is harmless', async () => {
    for (const data of [new InMemoryOrders(), getOrdersDatabase()]) {
      const keep = await data.placeOrder({ book: 1 })
      const remove = await data.placeOrder({ book: 2 })

      await data.removeOrder(remove)
      await data.removeOrder(remove)

      expect(await data.getOrder(remove)).toBe(false)
      expect((await data.listOrders()).map(({ orderId }) => orderId)).toEqual([keep])
    }
  })

  test('valid book ids can be saved, checked, counted and removed', async () => {
    for (const data of [new InMemoryOrders(), getOrdersDatabase()]) {
      await data.saveBookId('book_1')
      await data.saveBookId('book_1')
      expect(await data.isValidBook('book_1')).toBe(true)
      expect(await data.countValidBooks()).toEqual(1)

      await data.removeBookId('book_1')
      expect(await data.isValidBook('book_1')).toBe(false)
      expect(await data.countValidBooks()).toEqual(0)
    }
  })
}
