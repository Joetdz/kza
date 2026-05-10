import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Singleton to prevent connection leak during NestJS hot-reload (--watch)
const g = globalThis as any;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    if (g.__prisma) {
      // Reuse existing client — avoid opening new pool on hot-reload
      return g.__prisma;
    }
    super({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: [],
    });
    g.__prisma = this;
  }

  async onModuleInit() {
    // Auto-retry middleware — covers ALL queries from every service automatically
    this.$use(async (params, next) => {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await next(params);
        } catch (err: any) {
          const isConnErr = err?.code === 'P1001' || err?.code === 'P1017' || err?.code === 'P1002';
          if (isConnErr && attempt < maxRetries) {
            this.logger.warn(`DB conn error (${err.code}) on ${params.model}.${params.action}, retry ${attempt}/${maxRetries}`);
            await new Promise(r => setTimeout(r, 500 * attempt));
            try { await this.$connect(); } catch { /* ignore */ }
            continue;
          }
          throw err;
        }
      }
    });
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Retry wrapper for transient connection errors (P1017, P1001)
  async withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 500): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const isConnErr = err?.code === 'P1017' || err?.code === 'P1001' || err?.code === 'P1002';
        if (isConnErr && attempt < retries) {
          this.logger.warn(`DB connection error (${err.code}), retry ${attempt}/${retries} in ${delayMs}ms`);
          await new Promise(r => setTimeout(r, delayMs * attempt));
          try { await this.$connect(); } catch { /* ignore reconnect error */ }
          continue;
        }
        throw err;
      }
    }
    throw new Error('unreachable');
  }
}
