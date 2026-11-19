import Koa from 'koa'
import cors from '@koa/cors'
import qs from 'koa-qs'
import zodRouter from 'koa-zod-router'
import { setupBookRoutes } from './src/books'
import { RegisterRoutes } from './build/routes'
import KoaRouter from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { type Server, type IncomingMessage, type ServerResponse } from 'http'
import { type AppBookDatabaseState, getBookDatabase } from './src/database_access'
import { type AppEventsState, type EventBus, InMemoryEventBus } from '../shared/events'

export default async function (
  port?: number,
  randomizeDbs?: boolean,
  events: EventBus = new InMemoryEventBus()
): Promise<{
    server: Server<typeof IncomingMessage, typeof ServerResponse>
    state: AppBookDatabaseState & AppEventsState
  }> {
  const bookDb = getBookDatabase(randomizeDbs === true ? undefined : 'mcmasterful-books')

  const state: AppBookDatabaseState & AppEventsState = {
    // RabbitMQ in the running stack; the in-memory fake in the tests.
    events,
    books: bookDb
  }

  const app = new Koa<AppBookDatabaseState & AppEventsState, Koa.DefaultContext>()

  app.use(async (ctx, next): Promise<void> => {
    ctx.state = state
    await next()
  })

  // We use koa-qs to enable parsing complex query strings, like our filters.
  qs(app)

  // And we add cors to ensure we can access our API from the mcmasterful-books website
  app.use(cors())

  const router = zodRouter({ zodRouter: { exposeRequestErrors: true } })

  setupBookRoutes(router, state.books)

  app.use(bodyParser())
  app.use(router.routes())

  const koaRouter = new KoaRouter()

  RegisterRoutes(koaRouter)

  app.use(koaRouter.routes())

  // The Swagger docs moved to the docs service in V1.2.3 (docs/server.ts).
  // Event subscriptions are registered above this line; then start receiving.
  await events.start()

  return {
    server: app.listen(port, () => {
      console.log('listening')
    }),
    state
  }
}
