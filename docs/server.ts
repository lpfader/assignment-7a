import Koa from 'koa'
import { koaSwagger } from 'koa2-swagger-ui'
import { type Server, type IncomingMessage, type ServerResponse } from 'http'
// The combined spec for every API, built by the root tsoa.json (./generate-openapi.sh)
import swagger from '../build/swagger.json'

// The docs service: only the Swagger UI, for every API at once. It has no
// database and no routes of its own. Moved out of books/server.ts in V1.2.3.
export default async function (port?: number): Promise<{
  server: Server<typeof IncomingMessage, typeof ServerResponse>
}> {
  const app = new Koa()

  app.use(
    koaSwagger({
      routePrefix: '/docs',
      specPrefix: '/docs/spec',
      exposeSpec: true,
      swaggerOptions: {
        spec: swagger
      }
    })
  )

  return {
    server: app.listen(port, () => {
      console.log('docs listening')
    })
  }
}
