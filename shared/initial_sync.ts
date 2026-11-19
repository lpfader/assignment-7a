import { type BookID } from './documented_types'

// The one-time startup request the brief allows: a service whose copy of the book
// list is empty asks the books API for every book once. After that, events keep the
// copy up to date. Only index.ts calls this, so the tests never make the request.

export type FetchBooks = () => Promise<Array<{ id: BookID, name: string }>>

// Ask the books API for every book, retrying while it starts up: by default every
// 2 seconds for about 30 seconds.
export function booksFromApi (
  url: string = process.env.BOOKS_API_URL ?? 'http://books:3000',
  attempts: number = 15,
  delayMs: number = 2000
): FetchBooks {
  return async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch(`${url}/books/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '[]'
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return (await response.json()) as Array<{ id: BookID, name: string }>
      } catch (e) {
        if (attempt >= attempts) {
          throw new Error(`could not fetch the book list from ${url}`, { cause: e })
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
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
