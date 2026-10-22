import mongoose from "mongoose";
import { getEnv } from "./env.ts";

// One connection per server process. Next.js dev reloads modules, so the promise is cached on globalThis.

type Cache = { promise: Promise<typeof mongoose> | null };
const g = globalThis as typeof globalThis & { __falkenMongo?: Cache };
const cache: Cache = (g.__falkenMongo ??= { promise: null });

export async function connectDb(): Promise<typeof mongoose> {
  // Reuse a connection somebody already opened (integration tests open one to a local database).
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!cache.promise) {
    const env = getEnv();
    cache.promise = mongoose
      .connect(env.MONGODB_URI, { dbName: env.MONGODB_DB, serverSelectionTimeoutMS: 8000 })
      .catch((err) => {
        cache.promise = null; // allow a retry on the next request
        throw err;
      });
  }
  return cache.promise;
}

export async function disconnectDb(): Promise<void> {
  cache.promise = null;
  await mongoose.disconnect();
}
