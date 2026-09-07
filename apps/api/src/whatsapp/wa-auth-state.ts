import {
  BufferJSON,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';
import { Prisma } from '@prisma/client';
import pino from 'pino';
import { PrismaService } from '../prisma/prisma.service';

const silentLogger = pino({ level: 'silent' });

// Convert any Buffer values to a JSON-safe representation before storing in Postgres
function toJsonSafe(obj: any): any {
  return JSON.parse(JSON.stringify(obj, BufferJSON.replacer));
}

// Reconstruct Buffer values after loading from Postgres
function fromJsonSafe(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj), BufferJSON.reviver);
}

// Each business owns its own WhatsApp connection, so credentials and Signal keys
// are scoped by (userId, businessId) — never by userId alone.
export async function useDbAuthState(userId: string, businessId: string | null, prisma: PrismaService) {
  // Load credentials from WhatsAppSession.authState (null on first pair → fresh creds)
  const session = await prisma.whatsAppSession.findFirst({ where: { userId, businessId } });
  const creds = session?.authState ? fromJsonSafe(session.authState) : initAuthCreds();

  const rawStore = {
    get: async (type: string, ids: string[]): Promise<Record<string, any>> => {
      const rows = await prisma.waBaileyAuthKey.findMany({
        where: { userId, businessId, keyType: type, keyId: { in: ids } },
      });
      const result: Record<string, any> = {};
      for (const row of rows) {
        let val = fromJsonSafe(row.keyData);
        // Proto messages must be deserialized via protobuf (same as useMultiFileAuthState)
        if (type === 'app-state-sync-key' && val) {
          val = proto.Message.AppStateSyncKeyData.fromObject(val);
        }
        result[row.keyId] = val;
      }
      return result;
    },
    set: async (data: Record<string, Record<string, any> | undefined>): Promise<void> => {
      const tasks: Promise<any>[] = [];
      for (const [type, records] of Object.entries(data)) {
        if (!records) continue;
        for (const [id, value] of Object.entries(records)) {
          if (value == null) {
            tasks.push(
              prisma.waBaileyAuthKey
                .deleteMany({ where: { userId, businessId, keyType: type, keyId: id } })
                .catch(() => {}),
            );
          } else {
            // businessId is nullable, so the compound unique can't be used with upsert —
            // update-then-insert instead.
            const keyData = toJsonSafe(value);
            tasks.push(
              prisma.waBaileyAuthKey
                .updateMany({
                  where: { userId, businessId, keyType: type, keyId: id },
                  data: { keyData },
                })
                .then(res =>
                  res.count === 0
                    ? prisma.waBaileyAuthKey.create({
                        data: { userId, businessId, keyType: type, keyId: id, keyData },
                      })
                    : null,
                )
                .catch(() => {}),
            );
          }
        }
      }
      await Promise.all(tasks);
    },
  };

  const state = {
    creds,
    keys: makeCacheableSignalKeyStore(rawStore as any, silentLogger as any),
  };

  const saveCreds = async () => {
    const authState = toJsonSafe(creds);
    const updated = await prisma.whatsAppSession.updateMany({
      where: { userId, businessId },
      data: { authState },
    });
    if (updated.count === 0) {
      await prisma.whatsAppSession.create({
        data: { userId, businessId, authState, connected: false },
      });
    }
  };

  return { state, saveCreds };
}

/** Wipe auth data for one business's connection (called on logout or before a fresh pair) */
export async function clearDbAuth(
  userId: string,
  businessId: string | null,
  prisma: PrismaService,
): Promise<void> {
  await Promise.all([
    prisma.whatsAppSession
      .updateMany({ where: { userId, businessId }, data: { authState: Prisma.DbNull } })
      .catch(() => {}),
    prisma.waBaileyAuthKey.deleteMany({ where: { userId, businessId } }).catch(() => {}),
  ]);
}
