import Koa from 'koa'
import cors from '@koa/cors'
import KoaRouter from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { type Server, type IncomingMessage, type ServerResponse } from 'http'
import { RegisterRoutes } from './build/routes'
import { type AppWarehouseDatabaseState, getDefaultWarehouseDatabase } from './src/warehouse_database'
import { type AppBrokerState, type Broker } from './src/messaging'

// The warehouse API: the shelf routes and order fulfilment.
export default async function (
  port?: number,
  randomizeDbs?: boolean,
  broker?: Broker
): Promise<{
    server: Server<typeof IncomingMessage, typeof ServerResponse>
    state: AppWarehouseDatabaseState & AppBrokerState
  }> {
  // TEMPORARY: the orders API uses this database too, because fulfilment reads and
  // removes orders. Step 3 gives each API its own database and uses events instead.
  const state: AppWarehouseDatabaseState & AppBrokerState = {
    // Kept for Step 3, where the API publishes and subscribes to events.
    broker,
    warehouse: await getDefaultWarehouseDatabase(randomizeDbs === true ? undefined : 'mcmasterful-warehouse')
  }

  const app = new Koa<AppWarehouseDatabaseState & AppBrokerState, Koa.DefaultContext>()

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
      console.log('warehouse listening')
    }),
    state
  }
}
