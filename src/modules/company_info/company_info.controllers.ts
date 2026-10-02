import { companyInfo, prisma } from "../../../prisma/db";

async function redisGet(redis: { get: (key: string) => Promise<string | null> }, key: string) {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

async function redisSet(
  redis: { set: (key: string, value: string) => Promise<unknown> },
  key: string,
  value: string,
) {
  try {
    await redis.set(key, value);
  } catch {
    // Redis optional — ignore cache write failures
  }
}

const COMPANY_CACHE_KEY = "company_info_contacts";
const MAX_NUMBERS = 8;

function cleanNumberList(value) {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set();
  const numbers = [];

  for (const item of source) {
    const text = String(item ?? "").trim();
    const digits = text.replace(/\D/g, "");
    if (digits.length < 6 || seen.has(digits)) continue;
    seen.add(digits);
    numbers.push(text);
    if (numbers.length >= MAX_NUMBERS) break;
  }

  return numbers;
}

function storedNumberList(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      return cleanNumberList(JSON.parse(text));
    } catch {
      return cleanNumberList(text);
    }
  }
  return cleanNumberList(text);
}

function shapeCompany(row) {
  if (!row) return null;
  const phones = Array.isArray(row.company_phones)
    ? cleanNumberList(row.company_phones)
    : storedNumberList(row.company_phone);
  const whatsapp = Array.isArray(row.whatsapp_numbers)
    ? cleanNumberList(row.whatsapp_numbers)
    : storedNumberList(row.whatsapp_numbers);

  return {
    id: row.id,
    company_name: row.company_name,
    company_email: row.company_email,
    company_phone: phones[0] || "",
    company_phones: phones,
    whatsapp_numbers: whatsapp,
    address: row.address,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function redisDel(redis: { del: (key: string) => Promise<unknown> }, key: string) {
  try {
    await redis.del(key);
  } catch {
    // Redis optional — ignore cache clear failures
  }
}

export const getCompanyInfo = async (request, reply) => {
  try {
    const redis = request.server.redis;
    const cached = await redisGet(redis, COMPANY_CACHE_KEY);

    if (cached) {
      return reply.status(200).send({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const plan = prisma.raw.sql`
      SELECT
        c.id,
        c.company_name,
        c.company_email,
        c.company_phone,
        c.whatsapp_numbers,
        c.address,
        c."createdAt",
        c."updatedAt"
      FROM company_info c
      ORDER BY c."createdAt" ASC
      LIMIT 1
    `
      .returnsRow({
        id: "pg/text@1",
        company_name: { codecId: "pg/text@1", nullable: true },
        company_email: { codecId: "pg/text@1", nullable: true },
        company_phone: { codecId: "pg/text@1", nullable: true },
        whatsapp_numbers: { codecId: "pg/text@1", nullable: true },
        address: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
        updatedAt: "pg/timestamptz-string@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const info = shapeCompany(list[0] || null);

    await redisSet(redis, COMPANY_CACHE_KEY, JSON.stringify(info));

    return reply.status(200).send({
      success: true,
      data: info,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const createCompanyInfo = async (request, reply) => {
  try {
    const { company_name, company_email, address } = request.body;
    const phones = cleanNumberList(
      request.body?.company_phones ?? request.body?.company_phone,
    );
    const whatsapp = cleanNumberList(request.body?.whatsapp_numbers);

    if (!phones.length) {
      return reply.status(400).send({
        success: false,
        message: "At least one phone number is required",
      });
    }

    const rows = await companyInfo
      .select("id")
      .orderBy((row) => row.createdAt.asc())
      .limit(1)
      .all();
    const existing = rows[0];

    let info;

    const phoneJson = JSON.stringify(phones);
    const whatsappJson = JSON.stringify(whatsapp);

    if (existing) {
      info = await companyInfo.where({ id: existing.id }).update({
        company_name,
        company_email,
        company_phone: phoneJson,
        address,
        city: null,
        country: null,
        location_label: null,
      });
    } else {
      info = await companyInfo.create({
        company_name,
        company_email,
        company_phone: phoneJson,
        address,
      });
    }

    if (info?.id) {
      await prisma.runtime().query(
        prisma.raw.sql`
          UPDATE company_info
          SET whatsapp_numbers = ${whatsappJson}
          WHERE id = ${info.id}
        `
          .affectedCount()
          .build(),
      );
    }

    await redisDel(request.server.redis, COMPANY_CACHE_KEY);
    await redisDel(request.server.redis, "company_info");

    return reply.status(existing ? 200 : 201).send({
      success: true,
      data: shapeCompany({
        ...info,
        company_phone: phoneJson,
        whatsapp_numbers: whatsappJson,
      }),
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
