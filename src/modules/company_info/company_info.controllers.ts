import { companyInfo, prisma } from "../../../prisma/db";

export const getCompanyInfo = async (request, reply) => {
  try {
    const redis = request.server.redis;
    const cached = await redis.get("company_info");

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
        c.address,
        c.city,
        c.country,
        c.location_label,
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
        address: { codecId: "pg/text@1", nullable: true },
        city: { codecId: "pg/text@1", nullable: true },
        country: { codecId: "pg/text@1", nullable: true },
        location_label: { codecId: "pg/text@1", nullable: true },
        createdAt: "pg/timestamptz-string@1",
        updatedAt: "pg/timestamptz-string@1",
      })
      .build();

    const result = await prisma.runtime().query(plan);
    const list = Array.isArray(result) ? result : [];
    const info = list[0] || null;

    await redis.set("company_info", JSON.stringify(info));

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
    const {
      company_name,
      company_email,
      company_phone,
      address,
      city,
      country,
      location_label,
    } = request.body;

    const rows = await companyInfo
      .select("id")
      .orderBy((row) => row.createdAt.asc())
      .limit(1)
      .all();
    const existing = rows[0];

    let info;

    if (existing) {
      info = await companyInfo.where({ id: existing.id }).update({
        company_name,
        company_email,
        company_phone,
        address,
        city,
        country,
        location_label,
      });
    } else {
      info = await companyInfo.create({
        company_name,
        company_email,
        company_phone,
        address,
        city,
        country,
        location_label,
      });
    }

    await request.server.redis.del("company_info");

    return reply.status(existing ? 200 : 201).send({
      success: true,
      data: {
        id: info.id,
        company_name: info.company_name,
        company_email: info.company_email,
        company_phone: info.company_phone,
        address: info.address,
        city: info.city,
        country: info.country,
        location_label: info.location_label,
        createdAt: info.createdAt,
        updatedAt: info.updatedAt,
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
