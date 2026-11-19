import Koa from 'koa'
import cors from '@koa/cors'
import KoaRouter from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { type Server, type IncomingMessage, type ServerResponse } from 'http'
import { RegisterRoutes } from './build/routes'
import { type AppWarehouseDatabaseState, getDefaultWarehouseDatabase } from './src/warehouse_database'
import { type AppEventsState, type EventBus, InMemoryEventBus } from '../shared/events'

// The warehouse API: the shelf routes and order fulfilment.
export default async function (
  port?: number,
  randomizeDbs?: boolean,
  events: EventBus = new InMemoryEventBus()
): Promise<{
    server: Server<typeof IncomingMessage, typeof ServerResponse>
    state: AppWarehouseDatabaseState & AppEventsState
  }> {
  // TEMPORARY: the orders API uses this database too, because fulfilment reads and
  // removes orders. Step 3 gives each API its own database and uses events instead.
  const state: AppWarehouseDatabaseState & AppEventsState = {
    // RabbitMQ in the running stack; the in-memory fake in the tests.
    events,
    warehouse: await getDefaultWarehouseDatabase(randomizeDbs === true ? undefined : 'mcmasterful-warehouse')
  }

  const app = new Koa<AppWarehouseDatabaseState & AppEventsState, Koa.DefaultContext>()

  app.use(async (ctx, next): Promise<void> => {
    ctx.state = state
    await next()
  })

  app.use(cors())
  app.use(bodyParser())

  const koaRouter = new KoaRouter()
  RegisterRoutes(koaRouter)
  app.use(koaRouter.routes())

  // Event subscriptions are registered above this line; then start receiving.
  await events.start()

  return {
    server: app.listen(port, () => {
      console.log('warehouse listening')
    }),
    state
  }
}
