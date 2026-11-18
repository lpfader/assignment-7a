import { ObjectId, type Collection, type Db } from 'mongodb'
import { type BookID, type OrderId } from '../../adapter/assignment-4'
import { client } from './database_access'

// The order half of books/src/warehouse/warehouse_data.ts and warehouse_database.ts,
// copied here so the orders API can run on its own.
//
// TEMPORARY (V1.2.1): this still uses the warehouse's database, because the
// warehouse's fulfil route reads and removes orders from the same collection.
// Step 3 gives each API its own database and replaces this sharing with events.

export interface OrdersData {
  getOrder: (order: OrderId) => Promise<Record<BookID, number> | false>
  placeOrder: (books: Record<BookID, number>) => Promise<OrderId>
  listOrders: () => Promise<Array<{ orderId: OrderId, books: Record<BookID, number> }>>
}

export interface AppOrdersDatabaseState {
  orders: OrdersData
}

export class InMemoryOrders implements OrdersData {
  orders: Record<OrderId, Record<BookID, number>>

  constructor (params?: { orders?: Record<OrderId, Record<BookID, number>> }) {
    this.orders = params?.orders ?? {}
  }

  async getOrder (order: OrderId): Promise<Record<BookID, number> | false> {
    return order in this.orders ? this.orders[order] : false
  }

  async listOrders (): Promise<Array<{ orderId: OrderId, books: Record<BookID, number> }>> {
    return Object.keys(this.orders).map((orderId) => ({ orderId, books: this.orders[orderId] }))
  }

  async placeOrder (books: Record<BookID, number>): Promise<OrderId> {
    const order = new ObjectId().toHexString()
    this.orders[order] = books
    return order
  }
}

export class DatabaseOrders implements OrdersData {
  orders: Collection<{ books: Record<BookID, number> }>

  constructor (database: Db) {
    this.orders = database.collection<{ books: Record<BookID, number> }>('orders')
  }

  async getOrder (order: OrderId): Promise<Record<BookID, number> | false> {
    const result = await this.orders.findOne({ _id: ObjectId.createFromHexString(order) })
    return result !== null ? result.books : false
  }

  async listOrders (): Promise<Array<{ orderId: OrderId, books: Record<BookID, number> }>> {
    const result = await this.orders.find().toArray()
    return result.map(({ _id, books }) => ({ orderId: _id.toHexString(), books }))
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
}
