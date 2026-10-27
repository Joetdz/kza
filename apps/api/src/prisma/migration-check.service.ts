import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { PrismaService } from './prisma.service';

// Read-only check at startup: says loudly which SQL migrations the database hasn't
// had yet. It NEVER applies anything — migrations only run through `npm run migrate`,
// which asks for explicit confirmation.
@Injectable()
export class MigrationCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Migrations');

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      // dist/src/prisma → apps/api/prisma/manual-migrations, whatever the build layout
      const dir = [
        resolve(__dirname, '../../prisma/manual-migrations'),
        resolve(__dirname, '../../../prisma/manual-migrations'),
        resolve(process.cwd(), 'prisma/manual-migrations'),
        resolve(process.cwd(), 'apps/api/prisma/manual-migrations'),
      ].find(existsSync);
      if (!dir) return;
      const files = readdirSync(dir).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();

      const [{ tracked }] = await this.prisma.$queryRawUnsafe<{ tracked: boolean }[]>(
        `SELECT to_regclass('public._kza_migrations') IS NOT NULL AS tracked`,
      );
      if (!tracked) {
        this.logger.warn('Suivi des migrations pas encore initialisé — lance `npm run migrate -- --status` depuis ton poste.');
        return;
      }
      const rows = await this.prisma.$queryRawUnsafe<{ name: string }[]>('SELECT name FROM _kza_migrations');
      const applied = new Set(rows.map(r => r.name));
      const pending = files.filter(f => !applied.has(f));
      if (pending.length) {
        this.logger.error(`⚠️  ${pending.length} migration(s) NON appliquée(s) : ${pending.join(', ')} — lance \`npm run migrate\` (confirmation demandée).`);
      }
    } catch (err: any) {
      this.logger.warn(`Vérification des migrations impossible : ${err?.message}`);
    }
  }
}
