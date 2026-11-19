import { type EventBus } from '../../shared/events'
import { type OrdersData } from './orders_data'

// Keep the orders service's copy of the valid book ids up to date with the events
// books publishes. Orders only needs the ids, so it ignores BookUpdated.
export async function subscribeToBookEvents (events: EventBus, data: OrdersData): Promise<void> {
  await events.subscribe('BookAdded', async ({ book }) => {
    await data.saveBookId(book.id)
  })
  await events.subscribe('BookRemoved', async ({ id }) => {
    await data.removeBookId(id)
  })
}
