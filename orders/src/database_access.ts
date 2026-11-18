import { MongoClient } from 'mongodb'

// Copied from books/src/database_access.ts. Tests set MONGO_URI to an in-memory
// server; otherwise this is the mongo container from docker-compose.yaml.
const uri = ((global as any).MONGO_URI as string) ?? 'mongodb://mongo'

export const client = new MongoClient(uri)
