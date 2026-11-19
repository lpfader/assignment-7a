import { MongoClient } from 'mongodb'

// The tests set MONGO_URI to an in-memory server. Otherwise this is the warehouse's own
// database server (warehouse-db), from MONGO_URL in docker-compose.yaml. No other
// service connects to it.
const uri = ((global as any).MONGO_URI as string) ?? process.env.MONGO_URL ?? 'mongodb://warehouse-db'

export const client = new MongoClient(uri)
