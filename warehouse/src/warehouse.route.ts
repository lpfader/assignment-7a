import { BodyProp, Controller, Get, Path, Put, Route, SuccessResponse, Request, Res, type TsoaResponse } from 'tsoa'
import { getBookInfo } from './get_book_info'
import { type ShelfId, type BookID, type OrderId, type FulfilledBooks } from '../../shared/documented_types'
import { placeBooksOnShelf, UnknownBookError } from './place_on_shelf'
import { fulfilOrder } from './fulfil_order'
import { type ParameterizedContext, type DefaultContext, type Request as KoaRequest } from 'koa'
import { type AppWarehouseDatabaseState } from './warehouse_database'
import { type AppEventsState } from '../../shared/events'
import { publishStockLevels } from './stock_events'

type WarehouseContext = ParameterizedContext<AppWarehouseDatabaseState & AppEventsState, DefaultContext>

@Route('warehouse')
export class WarehouseRoutes extends Controller {
  /**
   * Every book's total copies across all shelves. Used by books for its initial
   * stock sync; after that, books gets stock changes from BookStocked events.
   */
  @Get()
  public async getStockTotals (@Request() request: KoaRequest): Promise<Record<BookID, number>> {
    const ctx: WarehouseContext = request.ctx
    return await ctx.state.warehouse.getAllTotals()
  }

  /**
   * Find the shelves that have copies of the book, and how
   * many copies each shelf has
   * @param book The book's unique identifier!
   * @returns {BookInfo}
   */
  @Get('{book}')
  public async getBookInfo (@Path() book: BookID, @Request() request: KoaRequest): Promise<Record<string, number>> {
    const ctx: ParameterizedContext<AppWarehouseDatabaseState, DefaultContext> = request.ctx
    const data = ctx.state.warehouse
    return await getBookInfo(data, book)
  }

  /**
   * Add copies of a book to a provided shelf
   * @param book The book's unique identifier
   * @param shelf The shelf's name
   * @param number The number of copies to place on the shelf
   */
  @Put('{book}/{shelf}/{number}')
  @SuccessResponse(201, 'Added')
  public async placeBooksOnShelf (
    @Path() book: BookID,
      @Path() shelf: ShelfId,
      @Path() number: number,
      @Request() request: KoaRequest,
      @Res() unknownBook: TsoaResponse<404, string, { 'Content-Type': 'text/plain' }>
  ): Promise<void> {
    const ctx: WarehouseContext = request.ctx
    this.setStatus(201)
    try {
      await placeBooksOnShelf(ctx.state.warehouse, book, number, shelf)
      // Only after the stock was saved: tell books the new total.
      await publishStockLevels(ctx.state.events, ctx.state.warehouse, [book])
    } catch (e) {
      if (e instanceof UnknownBookError) {
        // 404: the book in the URL doesn't exist (as far as the warehouse knows)
        unknownBook(404, e.message, { 'Content-Type': 'text/plain' })
        return
      }
      throw e
    }
  }
}

@Route('fulfil')
export class FulfilOrderRoutes extends Controller {
  /**
   * Fulfil an order by taking all the relevant book copies for the order off the shelves
   * @param order The Order ID
   * @param booksFulfilled An array lsting how many copies of each book were taken from each shelf
   */
  @Put('{order}')
  @SuccessResponse(201, 'Fulfilled')
  public async fulfilOrder (
    @Path() order: OrderId,
      @BodyProp('booksFulfilled') booksFulfilled: FulfilledBooks,
      @Request() request: KoaRequest
  ): Promise<void> {
    const ctx: WarehouseContext = request.ctx
    this.setStatus(201)
    try {
      await fulfilOrder(ctx.state.warehouse, order, booksFulfilled)
      // Only after the copies came off the shelves: tell books each book's new total,
      // and tell orders the order is done.
      await publishStockLevels(ctx.state.events, ctx.state.warehouse, booksFulfilled.map(({ book }) => book))
      await ctx.state.events.publish('OrderFulfilled', { orderId: order })
      this.setStatus(201)
    } catch (e) {
      this.setStatus(500)
      console.error('Error Fulfilling Order', e)
    }
  }
}

// The /order routes moved to the orders API in V1.2.1 (orders/src/orders.route.ts).
