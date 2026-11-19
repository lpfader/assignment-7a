import Koa from 'koa'
import cors from '@koa/cors'
import KoaRouter from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { type Server, type IncomingMessage, type ServerResponse } from 'http'
import { RegisterRoutes } from './build/routes'
import { type AppOrdersDatabaseState, getOrdersDatabase } from './src/orders_data'
import { type AppBrokerState, type Broker } from './src/messaging'

// The orders API: only the /order routes.
export default async function (
  port?: number,
  randomizeDbs?: boolean,
  broker?: Broker
): Promise<{
    server: Server<typeof IncomingMessage, typeof ServerResponse>
    state: AppOrdersDatabaseState & AppBrokerState
  }> {
  // TEMPORARY (V1.2.1): same database as the warehouse, see src/orders_data.ts
  const state: AppOrdersDatabaseState & AppBrokerState = {
    // Kept for Step 3, where the API publishes and subscribes to events.
    broker,
    orders: getOrdersDatabase(randomizeDbs === true ? undefined : 'mcmasterful-warehouse')
  }

  const app = new Koa<AppOrdersDatabaseState & AppBrokerState, Koa.DefaultContext>()

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
