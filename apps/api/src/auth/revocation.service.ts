/**
 * Token revocation via Redis.
 *
 * Strategy: store tokenVersion (tv) per user in Redis with a short TTL.
 * On every authenticated request JwtAuthGuard calls getCurrentTv():
 *  - Cache hit:  compare JWT tv with stored tv. JWT tv < stored → revoked.
 *  - Cache miss: fall back to DB (source of truth), then populate cache.
 *  - Redis READ error: fall back to DB — never serve stale, never fail-open.
 *
 * On tv bump (lock / logout-all): DELETE the key (invalidate) rather than
 * setex with the new value. A failed delete cannot leave a stale pre-lock tv
 * in cache; the next read is a guaranteed cache miss → DB fallback.
 * setTokenVersion is kept for explicit warming (e.g. after the delete succeeds
 * we warm with the new value so the next request hits cache with the right tv).
 *
 * TTL is ≤20s — short enough that a missed invalidation self-heals quickly,
 * long enough to absorb per-request DB load.
 *
 * Redis is used only for token-version caching (no BullMQ/workers).
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/** Short TTL so a missed invalidation self-heals within 20s. */
const CACHE_TTL_SECONDS = 20;

@Injectable()
export class RevocationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RevocationService.name);
  private redis!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.getOrThrow<string>("REDIS_URL");
    this.redis = new Redis(url, { lazyConnect: true, enableReadyCheck: false });
    this.redis.on("error", (err) => this.logger.error("Redis error", err));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Called after a tv bump (lock / logout-all).
   * Protocol:
   *   1. DELETE the old key — stale pre-lock tv is gone regardless of write outcome.
   *   2. SET the new tv — warms the cache so the next request doesn't hit DB.
   * If step 2 fails the next request is a cache miss → DB fallback; still correct.
   */
  async invalidateAndSet(userId: string, newTv: number): Promise<void> {
    // Step 1 — evict stale value. This is the safety step; must not swallow errors.
    await this.redis.del(this.key(userId));
    // Step 2 — warm cache with new value (best-effort; failure is safe).
    this.redis.setex(this.key(userId), CACHE_TTL_SECONDS, String(newTv)).catch((err) =>
      this.logger.warn(`Redis warm-after-bump failed for ${userId} (non-fatal)`, err),
    );
  }

  /**
   * Return the current tv for a user.
   * Cache hit  → return cached value (fast path).
   * Cache miss or READ error → fall back to DB (dbTvFallback), then populate cache.
   * Never fail-open: on Redis error we always ask the DB.
   */
  async getCurrentTv(userId: string, dbTvFallback: () => Promise<number>): Promise<number> {
    let cached: string | null = null;
    try {
      cached = await this.redis.get(this.key(userId));
    } catch (err) {
      // Redis read error — fall back to DB, do not serve stale.
      this.logger.warn(`Redis GET failed for ${userId}, falling back to DB`, err);
    }

    if (cached !== null) return Number(cached);

    const dbTv = await dbTvFallback();
    // Populate cache; fire-and-forget — don't fail the request if Redis is down.
    this.redis.setex(this.key(userId), CACHE_TTL_SECONDS, String(dbTv)).catch((err) =>
      this.logger.warn(`Redis setex failed for ${userId} (non-fatal)`, err),
    );
    return dbTv;
  }

  private key(userId: string): string {
    return `tv:${userId}`;
  }
}
