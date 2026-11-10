import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Days are Kinshasa's: « today » is the visitors' today. */
const TZ = 'Africa/Kinshasa';
const SERIES_DAYS = 30;
const TOP_STORES = 10;

export interface DayStat { day: string; visitors: number; newVisitors: number; orders: number }

/**
 * Ikele's visitor counter. A visitor is a device (the anonymous id already used for likes
 * and follows), counted once a day for the app and once a day for each store it sees.
 */
@Injectable()
export class IkeleStatsService {
  constructor(private prisma: PrismaService) {}

  async recordVisit(visitorId: unknown, storeSlug?: unknown) {
    if (typeof visitorId !== 'string' || !UUID.test(visitorId)) return { ok: false };
    await this.prisma.$executeRaw`
      INSERT INTO ikele_visits (day, visitor_id)
      VALUES ((now() AT TIME ZONE ${TZ})::date, ${visitorId}::uuid)
      ON CONFLICT DO NOTHING`;
    if (typeof storeSlug === 'string' && storeSlug) {
      await this.prisma.$executeRaw`
        INSERT INTO ikele_store_visits (day, store_id, visitor_id)
        SELECT (now() AT TIME ZONE ${TZ})::date, id, ${visitorId}::uuid
        FROM online_stores WHERE slug = ${storeSlug} AND active
        ON CONFLICT DO NOTHING`;
    }
    return { ok: true };
  }

  /** The whole of Ikele: visitors, new visitors, Ikele orders, the stores most visited. */
  async platform() {
    const series = await this.prisma.$queryRaw<{ day: Date; visitors: bigint; new_visitors: bigint; orders: bigint }[]>`
      WITH bounds AS (SELECT (now() AT TIME ZONE ${TZ})::date AS today),
      days AS (
        SELECT generate_series(today - ${SERIES_DAYS - 1}::int, today, interval '1 day')::date AS day FROM bounds
      ),
      firsts AS (SELECT visitor_id, min(day) AS first_day FROM ikele_visits GROUP BY visitor_id)
      SELECT d.day,
        (SELECT count(*) FROM ikele_visits v WHERE v.day = d.day) AS visitors,
        (SELECT count(*) FROM firsts f WHERE f.first_day = d.day) AS new_visitors,
        (SELECT count(*) FROM store_orders o
          WHERE o.source = 'ikele' AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = d.day) AS orders
      FROM days d ORDER BY d.day`;

    const [totals] = await this.prisma.$queryRaw<{ today: bigint; week: bigint; month: bigint; all_time: bigint }[]>`
      WITH bounds AS (SELECT (now() AT TIME ZONE ${TZ})::date AS today)
      SELECT
        (SELECT count(*) FROM ikele_visits, bounds WHERE day = today) AS today,
        (SELECT count(DISTINCT visitor_id) FROM ikele_visits, bounds WHERE day > today - 7) AS week,
        (SELECT count(DISTINCT visitor_id) FROM ikele_visits, bounds WHERE day > today - 30) AS month,
        (SELECT count(DISTINCT visitor_id) FROM ikele_visits) AS all_time`;

    const top = await this.prisma.$queryRaw<{ name: string; slug: string; visitors: bigint; orders: bigint }[]>`
      WITH bounds AS (SELECT (now() AT TIME ZONE ${TZ})::date AS today)
      SELECT s.name, s.slug, count(DISTINCT v.visitor_id) AS visitors,
        (SELECT count(*) FROM store_orders o
          WHERE o.store_id = s.id AND o.source = 'ikele'
            AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date > (SELECT today FROM bounds) - 7) AS orders
      FROM ikele_store_visits v JOIN online_stores s ON s.id = v.store_id, bounds
      WHERE v.day > today - 7
      GROUP BY s.id, s.name, s.slug
      ORDER BY visitors DESC
      LIMIT ${TOP_STORES}`;

    return {
      totals: {
        today: Number(totals.today), week: Number(totals.week), month: Number(totals.month), allTime: Number(totals.all_time),
      },
      days: series.map(toDay),
      topStores: top.map(t => ({ name: t.name, slug: t.slug, visitors: Number(t.visitors), orders: Number(t.orders) })),
    };
  }

  /** One store: the visitors who saw it on Ikele, and its Ikele orders. */
  async store(storeId: string) {
    const series = await this.prisma.$queryRaw<{ day: Date; visitors: bigint; new_visitors: bigint; orders: bigint }[]>`
      WITH bounds AS (SELECT (now() AT TIME ZONE ${TZ})::date AS today),
      days AS (
        SELECT generate_series(today - ${SERIES_DAYS - 1}::int, today, interval '1 day')::date AS day FROM bounds
      ),
      firsts AS (
        SELECT visitor_id, min(day) AS first_day FROM ikele_store_visits
        WHERE store_id = ${storeId}::uuid GROUP BY visitor_id
      )
      SELECT d.day,
        (SELECT count(*) FROM ikele_store_visits v WHERE v.store_id = ${storeId}::uuid AND v.day = d.day) AS visitors,
        (SELECT count(*) FROM firsts f WHERE f.first_day = d.day) AS new_visitors,
        (SELECT count(*) FROM store_orders o
          WHERE o.store_id = ${storeId}::uuid AND o.source = 'ikele'
            AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = d.day) AS orders
      FROM days d ORDER BY d.day`;

    const [totals] = await this.prisma.$queryRaw<{ today: bigint; week: bigint; month: bigint }[]>`
      WITH bounds AS (SELECT (now() AT TIME ZONE ${TZ})::date AS today)
      SELECT
        (SELECT count(*) FROM ikele_store_visits, bounds WHERE store_id = ${storeId}::uuid AND day = today) AS today,
        (SELECT count(DISTINCT visitor_id) FROM ikele_store_visits, bounds WHERE store_id = ${storeId}::uuid AND day > today - 7) AS week,
        (SELECT count(DISTINCT visitor_id) FROM ikele_store_visits, bounds WHERE store_id = ${storeId}::uuid AND day > today - 30) AS month`;

    return {
      totals: { today: Number(totals.today), week: Number(totals.week), month: Number(totals.month) },
      days: series.map(toDay),
    };
  }
}

function toDay(r: { day: Date; visitors: bigint; new_visitors: bigint; orders: bigint }): DayStat {
  return {
    day: r.day.toISOString().slice(0, 10),
    visitors: Number(r.visitors),
    newVisitors: Number(r.new_visitors),
    orders: Number(r.orders),
  };
}
