import { prisma } from "../../../prisma/db";

export const getDashboardStats = async (request, reply) => {
  try {
    const { period } = request.query;
    const selected = period || "today";

    if (
      selected !== "today" &&
      selected !== "7days" &&
      selected !== "month" &&
      selected !== "year"
    ) {
      return reply.status(400).send({
        success: false,
        message: "period must be today, 7days, month or year!",
      });
    }

    const now = new Date();
    let currentStart = new Date(now);
    let currentEnd = new Date(now);
    let previousStart = new Date(now);
    let previousEnd = new Date(now);
    let compare_label = "vs yesterday";

    if (selected === "today") {
      currentStart = new Date(now);
      currentStart.setUTCHours(0, 0, 0, 0);

      previousStart = new Date(currentStart);
      previousStart.setUTCDate(previousStart.getUTCDate() - 1);

      previousEnd = new Date(currentStart);
      compare_label = "vs yesterday";
    }

    if (selected === "7days") {
      currentStart = new Date(now);
      currentStart.setUTCDate(currentStart.getUTCDate() - 7);

      previousEnd = new Date(currentStart);
      previousStart = new Date(currentStart);
      previousStart.setUTCDate(previousStart.getUTCDate() - 7);
      compare_label = "vs previous 7 days";
    }

    if (selected === "month") {
      currentStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      previousStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );
      previousEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      compare_label = "vs last month";
    }

    if (selected === "year") {
      currentStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      previousStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
      previousEnd = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      compare_label = "vs last year";
    }

    const currentStartIso = currentStart.toISOString();
    const currentEndIso = currentEnd.toISOString();
    const previousStartIso = previousStart.toISOString();
    const previousEndIso = previousEnd.toISOString();

    const plan = prisma.raw.sql`
      SELECT
        (
          SELECT COUNT(*)::int FROM "order"
          WHERE "createdAt" >= ${currentStartIso}::timestamptz
            AND "createdAt" < ${currentEndIso}::timestamptz
        ) AS orders_current,
        (
          SELECT COUNT(*)::int FROM "order"
          WHERE "createdAt" >= ${previousStartIso}::timestamptz
            AND "createdAt" < ${previousEndIso}::timestamptz
        ) AS orders_previous,
        (
          SELECT COUNT(*)::int FROM reservation
          WHERE "createdAt" >= ${currentStartIso}::timestamptz
            AND "createdAt" < ${currentEndIso}::timestamptz
        ) AS reservations_current,
        (
          SELECT COUNT(*)::int FROM reservation
          WHERE "createdAt" >= ${previousStartIso}::timestamptz
            AND "createdAt" < ${previousEndIso}::timestamptz
        ) AS reservations_previous,
        (
          SELECT COUNT(*)::int FROM catering
          WHERE "createdAt" >= ${currentStartIso}::timestamptz
            AND "createdAt" < ${currentEndIso}::timestamptz
        ) AS catering_current,
        (
          SELECT COUNT(*)::int FROM catering
          WHERE "createdAt" >= ${previousStartIso}::timestamptz
            AND "createdAt" < ${previousEndIso}::timestamptz
        ) AS catering_previous
    `
      .returnsRow({
        orders_current: "pg/int4@1",
        orders_previous: "pg/int4@1",
        reservations_current: "pg/int4@1",
        reservations_previous: "pg/int4@1",
        catering_current: "pg/int4@1",
        catering_previous: "pg/int4@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const row = list[0] || {};

    const ordersCurrent = Number(row.orders_current || 0);
    const ordersPrevious = Number(row.orders_previous || 0);
    const reservationsCurrent = Number(row.reservations_current || 0);
    const reservationsPrevious = Number(row.reservations_previous || 0);
    const cateringCurrent = Number(row.catering_current || 0);
    const cateringPrevious = Number(row.catering_previous || 0);

    const ordersChange =
      ordersPrevious === 0
        ? ordersCurrent > 0
          ? 100
          : 0
        : Math.round(((ordersCurrent - ordersPrevious) / ordersPrevious) * 100);

    const reservationsChange =
      reservationsPrevious === 0
        ? reservationsCurrent > 0
          ? 100
          : 0
        : Math.round(
            ((reservationsCurrent - reservationsPrevious) /
              reservationsPrevious) *
              100,
          );

    const cateringChange =
      cateringPrevious === 0
        ? cateringCurrent > 0
          ? 100
          : 0
        : Math.round(
            ((cateringCurrent - cateringPrevious) / cateringPrevious) * 100,
          );

    return reply.status(200).send({
      success: true,
      data: {
        period: selected,
        compare_label,
        orders: {
          count: ordersCurrent,
          change_percent: Math.abs(ordersChange),
          direction:
            ordersChange > 0 ? "up" : ordersChange < 0 ? "down" : "flat",
        },
        reservations: {
          count: reservationsCurrent,
          change_percent: Math.abs(reservationsChange),
          direction:
            reservationsChange > 0
              ? "up"
              : reservationsChange < 0
                ? "down"
                : "flat",
        },
        catering: {
          count: cateringCurrent,
          change_percent: Math.abs(cateringChange),
          direction:
            cateringChange > 0 ? "up" : cateringChange < 0 ? "down" : "flat",
        },
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getOrdersThisWeek = async (request, reply) => {
  try {
    const now = new Date();
    const start = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 6,
        0,
        0,
        0,
        0,
      ),
    );
    const end = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
        0,
      ),
    );

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const plan = prisma.raw.sql`
      SELECT
        to_char((o."createdAt" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS count
      FROM "order" o
      WHERE o."createdAt" >= ${startIso}::timestamptz
        AND o."createdAt" < ${endIso}::timestamptz
      GROUP BY 1
      ORDER BY 1
    `
      .returnsRow({
        day: "pg/text@1",
        count: "pg/int4@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];

    const countByDay: any = {};
    for (const row of list) {
      countByDay[row.day] = Number(row.count || 0);
    }

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const points: any[] = [];
    let total = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + i);

      const key = date.toISOString().slice(0, 10);
      const count = countByDay[key] || 0;
      total += count;

      points.push({
        day: dayNames[date.getUTCDay()],
        date: key,
        count,
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        total,
        points,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
