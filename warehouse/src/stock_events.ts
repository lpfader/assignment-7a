import { type EventBus } from '../../shared/events'
import { type BookID } from '../../shared/documented_types'
import { type WarehouseData } from './warehouse_data'

// Tell books the new total stock of each given book, after its stock changed. The
// event carries the total, not the change, so handling it twice is harmless.
export async function publishStockLevels (events: EventBus, data: WarehouseData, books: BookID[]): Promise<void> {
  for (const book of new Set(books)) {
    const copies = await data.getCopies(book)
    const totalStock = Object.values(copies).reduce((sum, count) => sum + count, 0)
    await events.publish('BookStocked', { book, totalStock })
  }
}
