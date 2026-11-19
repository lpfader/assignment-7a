import { type Collection, type Db, MongoClient } from 'mongodb'
// We are importing the book type here, so we can keep our types consistent with the front end
import { type Book } from '../../adapter/assignment-3'

// The tests set MONGO_URI to an in-memory server. Otherwise this is books' own
// database server, from MONGO_URL in docker-compose.yaml.
const uri = ((global as any).MONGO_URI as string) ?? process.env.MONGO_URL ?? 'mongodb://mongo'

// We're setting up a client, opening the database for our project, and then opening
// a typed collection for our books.
export const client = new MongoClient(uri)

// We're moving the setup of the database and collections into a function with a returned value,
// to allow us to isolate them in tests

export interface BookDatabaseAccessor {
  database: Db
  books: Collection<Book>
  // books' own copy of each book's total stock, from the warehouse's BookStocked
  // events. A separate collection, because updating a book replaces its whole
  // document and would wipe a stock field stored on it.
  stockLevels: Collection<{ _id: string, totalStock: number }>
}

export interface AppBookDatabaseState {
  books: BookDatabaseAccessor
}

export function getBookDatabase (dbName?: string): BookDatabaseAccessor {
  const database = client.db(
    dbName ??
      Math.floor(Math.random() * 100000)
        .toPrecision()
        .toString()
  )
  const books = database.collection<Book>('books')
  const stockLevels = database.collection<{ _id: string, totalStock: number }>('stock_levels')

  return {
    database,
    books,
    stockLevels
  }
}

if (import.meta.vitest !== undefined) {
  const { test, expect } = import.meta.vitest

  test('Can Setup Test DB', () => {
    const { database } = getBookDatabase()
    expect(database.databaseName, `URI: ${uri}, DB: ${database.databaseName}`).not.toEqual('mcmasterful-books')
  })
}
