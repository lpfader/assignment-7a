import Koa from 'koa'
import cors from '@koa/cors'
import KoaRouter from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { type Server, type IncomingMessage, type ServerResponse } from 'http'
import { RegisterRoutes } from './build/routes'
import { type AppOrdersDatabaseState, getOrdersDatabase } from './src/orders_data'

// The orders API: only the /order routes. Swagger docs are served by the books
// API from the combined swagger.json until the docs project exists.
export default async function (
  port?: number,
  randomizeDbs?: boolean
): Promise<{
    server: Server<typeof IncomingMessage, typeof ServerResponse>
    state: AppOrdersDatabaseState
  }> {
  // TEMPORARY (V1.2.1): same database as the warehouse, see src/orders_data.ts
  const state: AppOrdersDatabaseState = {
    orders: getOrdersDatabase(randomizeDbs === true ? undefined : 'mcmasterful-warehouse')
  }

  const app = new Koa<AppOrdersDatabaseState, Koa.DefaultContext>()

  app.use(async (ctx, next): Promise<void> => {
    ctx.state = state
    await next()
  })

  app.use(cors())
  app.use(bodyParser())

  const koaRouter = new KoaRouter()
  RegisterRoutes(koaRouter)
  app.use(koaRouter.routes())

  return {
    server: app.listen(port, () => {
      console.log('orders listening')
    }),
    state
  }
}
