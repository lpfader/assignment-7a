import Koa from 'koa'
import cors from '@koa/cors'
import KoaRouter from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { type Server, type IncomingMessage, type ServerResponse } from 'http'
import { RegisterRoutes } from './build/routes'
import { type AppOrdersDatabaseState, getOrdersDatabase } from './src/orders_data'
import { type AppEventsState, type EventBus, InMemoryEventBus } from '../shared/events'

// The orders API: only the /order routes.
export default async function (
  port?: number,
  randomizeDbs?: boolean,
  events: EventBus = new InMemoryEventBus()
): Promise<{
    server: Server<typeof IncomingMessage, typeof ServerResponse>
    state: AppOrdersDatabaseState & AppEventsState
  }> {
  // TEMPORARY (V1.2.1): same database as the warehouse, see src/orders_data.ts
  const state: AppOrdersDatabaseState & AppEventsState = {
    // RabbitMQ in the running stack; the in-memory fake in the tests.
    events,
    orders: getOrdersDatabase(randomizeDbs === true ? undefined : 'mcmasterful-warehouse')
  }

  const app = new Koa<AppOrdersDatabaseState & AppEventsState, Koa.DefaultContext>()

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
      console.log('orders listening')
    }),
    state
  }
}
