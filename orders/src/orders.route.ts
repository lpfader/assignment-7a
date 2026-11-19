import { BodyProp, Controller, Get, Post, Route, SuccessResponse, Request, Res, type TsoaResponse } from 'tsoa'
import { type ParameterizedContext, type DefaultContext, type Request as KoaRequest } from 'koa'
import { type OrderId, type OrderPlacement, type Order } from '../../shared/documented_types'
import { placeOrder, UnknownBooksError } from './place_order'
import { listOrders } from './list_orders'
import { type AppOrdersDatabaseState } from './orders_data'

// Moved unchanged from books/src/warehouse/warehouse.route.ts, apart from
// reading ctx.state.orders instead of ctx.state.warehouse.
@Route('order')
export class OrderRoutes extends Controller {
  /**
   * Place an order
   * @param order An array of the ordered book id's
   * @returns {OrderId}
   */
  @Post()
  @SuccessResponse(201, 'created')
  public async placeOrder (
    @BodyProp('order') order: OrderPlacement,
      @Request() request: KoaRequest,
      @Res() unknownBooks: TsoaResponse<400, string, { 'Content-Type': 'text/plain' }>
  ): Promise<OrderId> {
    const ctx: ParameterizedContext<AppOrdersDatabaseState, DefaultContext> = request.ctx
    this.setStatus(201)
    try {
      const result = await placeOrder(ctx.state.orders, order)
      return result
    } catch (e) {
      if (e instanceof UnknownBooksError) {
        // 400: the order sent includes books that don't exist
        return unknownBooks(400, e.message, { 'Content-Type': 'text/plain' })
      }
      this.setStatus(500)
      return ''
    }
  }

  /**
   * Get all the pending orders
   * @returns {Order[]}
   */
  @Get()
  public async listOrders (@Request() request: KoaRequest): Promise<Order[]> {
    const ctx: ParameterizedContext<AppOrdersDatabaseState, DefaultContext> = request.ctx
    return await listOrders(ctx.state.orders)
  }
}
