import type { Redis } from "ioredis";
import type { AsyncStore } from "@revualy/chat-adapter-teams";

export class RedisAsyncStore implements AsyncStore {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }
}
