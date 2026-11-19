import { type BookID } from './documented_types'

// The one-time startup requests the brief allows: a service whose copy of another
// service's data is empty asks that service's API for all of it once. After that,
// events keep the copy up to date. Only index.ts calls these, so the tests never
// make the requests.

export type FetchBooks = () => Promise<Array<{ id: BookID, name: string }>>

// Fetch JSON from another API, retrying while it starts up: by default every
// 2 seconds for about 30 seconds.
async function fetchJsonWithRetry<T> (url: string, init: RequestInit, attempts: number, delayMs: number): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, init)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return (await response.json()) as T
    } catch (e) {
      if (attempt >= attempts) {
        throw new Error(`could not fetch ${url}`, { cause: e })
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

// Ask the books API for every book.
export function booksFromApi (
  url: string = process.env.BOOKS_API_URL ?? 'http://books:3000',
  attempts: number = 15,
  delayMs: number = 2000
): FetchBooks {
  return async () => await fetchJsonWithRetry<Array<{ id: BookID, name: string }>>(`${url}/books/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '[]'
  }, attempts, delayMs)
}

// Fill an empty copy from the books API. Does nothing if the copy already has
// books. A failure is logged, not thrown: the service still works, and events
// will still tell it about new books.
export async function syncBooksIfEmpty (
  service: string,
  copy: { count: () => Promise<number>, save: (id: BookID, name: string) => Promise<void> },
  fetchBooks: FetchBooks = booksFromApi()
): Promise<number> {
  if (await copy.count() > 0) {
    return 0
  }
  try {
    const books = await fetchBooks()
    for (const { id, name } of books) {
      await copy.save(id, name)
    }
    console.log(`[${service}] initial sync: copied ${books.length} books from the books API`)
    return books.length
  } catch (e) {
    console.error(`[${service}] initial sync failed, relying on events only`, e)
    return 0
  }
}

export type FetchStock = () => Promise<Record<BookID, number>>

// Ask the warehouse API for every book's total stock.
export function stockFromApi (
  url: string = process.env.WAREHOUSE_API_URL ?? 'http://warehouse:3000',
  attempts: number = 15,
  delayMs: number = 2000
): FetchStock {
  return async () => await fetchJsonWithRetry<Record<BookID, number>>(`${url}/warehouse`, {}, attempts, delayMs)
}

// Fill books' empty stock copy from the warehouse API. Same rules as the book sync:
// only when empty, and a failure is logged, not thrown.
export async function syncStockIfEmpty (
  service: string,
  copy: { count: () => Promise<number>, save: (id: BookID, totalStock: number) => Promise<void> },
  fetchStock: FetchStock = stockFromApi()
): Promise<number> {
  if (await copy.count() > 0) {
    return 0
  }
  try {
    const totals = await fetchStock()
    for (const [id, totalStock] of Object.entries(totals)) {
      await copy.save(id, totalStock)
    }
    const count = Object.keys(totals).length
    console.log(`[${service}] initial sync: copied the stock of ${count} books from the warehouse API`)
    return count
  } catch (e) {
    console.error(`[${service}] initial stock sync failed, relying on events only`, e)
    return 0
  }
}
