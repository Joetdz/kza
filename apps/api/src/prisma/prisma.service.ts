import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: [],
    });
  }

  async onModuleInit() {
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
