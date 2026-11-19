import type * as koa from 'koa'
import { Controller, Route, Request, Body, Post } from 'tsoa'
import { type BookID, type Book, type Filter } from '../../../shared/documented_types'
import { type AppBookDatabaseState } from '../database_access'
import { type AppEventsState } from '../../../shared/events'
import listBooks from './list'
import createOrUpdateBook from './create_or_update'

@Route('books')
export class BooksRoutes extends Controller {
  @Post('list')
  public async listBooks (@Body() filters: Filter[], @Request() request: koa.Request): Promise<Book[]> {
    const ctx: koa.ParameterizedContext<AppBookDatabaseState, koa.DefaultContext> = request.ctx
    return await listBooks(ctx.state.books, filters)
  }

  @Post()
  public async createOrUpdateBook (@Body() book: Book, @Request() request: koa.Request): Promise<{ id: BookID }> {
    const ctx: koa.ParameterizedContext<AppBookDatabaseState & AppEventsState, koa.DefaultContext> = request.ctx
    const result = await createOrUpdateBook(book, ctx.state.books)

    if (result !== false) {
      // Only after the database change succeeded: tell the other services.
      const saved = { ...book, id: result }
      if (typeof book.id === 'string') {
        await ctx.state.events.publish('BookUpdated', { book: saved })
      } else {
        await ctx.state.events.publish('BookAdded', { book: saved })
      }
      return { id: result }
    } else {
      this.setStatus(404)
      return { id: book.id ?? '' }
    }
  }
}
