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

export async function useDbAuthState(userId: string, prisma: PrismaService) {
  // Load credentials from WhatsAppSession.authState (null on first pair → fresh creds)
  const session = await prisma.whatsAppSession.findUnique({ where: { userId } });
  const creds = session?.authState ? fromJsonSafe(session.authState) : initAuthCreds();

  const rawStore = {
    get: async (type: string, ids: string[]): Promise<Record<string, any>> => {
      const rows = await prisma.waBaileyAuthKey.findMany({
        where: { userId, keyType: type, keyId: { in: ids } },
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
                .deleteMany({ where: { userId, keyType: type, keyId: id } })
                .catch(() => {}),
            );
          } else {
            tasks.push(
              prisma.waBaileyAuthKey
                .upsert({
                  where: { userId_keyType_keyId: { userId, keyType: type, keyId: id } },
                  create: { userId, keyType: type, keyId: id, keyData: toJsonSafe(value) },
                  update: { keyData: toJsonSafe(value) },
                })
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
    await prisma.whatsAppSession.upsert({
      where: { userId },
      create: { userId, authState: toJsonSafe(creds), connected: false },
      update: { authState: toJsonSafe(creds) },
    });
  };

  return { state, saveCreds };
}

/** Wipe all auth data for a user (called on logout or before a fresh pair) */
export async function clearDbAuth(userId: string, prisma: PrismaService): Promise<void> {
  await Promise.all([
    prisma.whatsAppSession
      .updateMany({ where: { userId }, data: { authState: Prisma.DbNull } })
      .catch(() => {}),
    prisma.waBaileyAuthKey.deleteMany({ where: { userId } }).catch(() => {}),
  ]);
}
