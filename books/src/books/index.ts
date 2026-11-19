import { type ZodRouter } from 'koa-zod-router'
import deleteBook from './delete'
import getBookRoute from './lookup'
import { type BookDatabaseAccessor } from '../database_access'
import { type EventBus } from '../../../shared/events'

export function setupBookRoutes (router: ZodRouter, books: BookDatabaseAccessor, events: EventBus): void {
  // Setup Book Delete Route (publishes BookRemoved)
  deleteBook(router, books, events)

  // Lookup Book
  getBookRoute(router, books)
}
