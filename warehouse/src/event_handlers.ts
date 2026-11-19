import { type EventBus } from '../../shared/events'
import { type WarehouseData } from './warehouse_data'

// Keep the warehouse's copy of which books exist (and their names) up to date with
// the events books publishes.
export async function subscribeToBookEvents (events: EventBus, data: WarehouseData): Promise<void> {
  await events.subscribe('BookAdded', async ({ book }) => {
    await data.saveBookName(book.id, book.name)
  })
  await events.subscribe('BookUpdated', async ({ book }) => {
    await data.saveBookName(book.id, book.name)
  })
  await events.subscribe('BookRemoved', async ({ id }) => {
    // Only the name is forgotten, so the book can't be restocked. Copies already on
    // the shelves stay recorded: they still physically exist.
    await data.removeBookName(id)
  })
}

// Keep the warehouse's own copy of open orders, from the orders service's events,
// so it can fulfil them without reading the orders service's database.
export async function subscribeToOrderEvents (events: EventBus, data: WarehouseData): Promise<void> {
  await events.subscribe('OrderPlaced', async ({ orderId, books }) => {
    await data.saveOrder(orderId, books)
  })
}
