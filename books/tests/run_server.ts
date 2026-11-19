import { afterEach, beforeEach } from 'vitest'
import server from '../server'
import { type AppBookDatabaseState } from '../src/database_access'
import { InMemoryEventBus } from '../../shared/events'

export interface ServerTestContext {
  address: string
  state: AppBookDatabaseState
  // The fake event bus the server was given, to check what it published
  events: InMemoryEventBus
  closeServer: () => void
}

export default function (): void {
  beforeEach<ServerTestContext>(async (context) => {
    const events = new InMemoryEventBus()
    const { server: instance, state } = await server(undefined, undefined, events)
    const address = instance.address()
    if (typeof address === 'string') {
      context.address = `http://${address}`
    } else if (address !== null) {
      context.address = `http://localhost:${address.port}`
    } else {
      throw new Error('couldnt set up server')
    }
    context.state = state
    context.events = events
    context.closeServer = () => {
      instance.close()
    }
  })

  afterEach<ServerTestContext>(async (context) => {
    context.closeServer()
  })
}
