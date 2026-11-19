import { MongoClient } from 'mongodb'

// The tests set MONGO_URI to an in-memory server. Otherwise this is orders' own
// database server (orders-db), from MONGO_URL in docker-compose.yaml. No other
// service connects to it.
const uri = ((global as any).MONGO_URI as string) ?? process.env.MONGO_URL ?? 'mongodb://orders-db'

export const client = new MongoClient(uri)
