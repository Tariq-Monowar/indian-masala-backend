import { db, prisma } from "../../../prisma/db";

export type CustomerAccount = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export function phoneDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeOptionalEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

const customerRow = {
  id: "pg/text@1",
  name: { codecId: "pg/text@1", nullable: true },
  email: { codecId: "pg/text@1", nullable: true },
  phone: { codecId: "pg/text@1", nullable: true },
} as const;

let emailColumnReady: Promise<void> | null = null;

/** Customers can exist without an email. The unique index still allows many NULLs. */
export function ensureCustomerEmailNullable() {
  if (!emailColumnReady) {
    const plan = prisma.raw.sql`
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL
    `
      .affectedCount()
      .build();
    emailColumnReady = prisma
      .runtime()
      .query(plan)
      .then(() => undefined)
      .catch((error) => {
        emailColumnReady = null;
        throw error;
      });
  }
  return emailColumnReady;
}

export async function findCustomerByPhone(phone: string) {
  const digits = phoneDigits(phone);
  if (digits.length < 6) return null;

  const plan = prisma.raw.sql`
    SELECT id, name, email, phone
    FROM users
    WHERE role = 'customer'
      AND COALESCE(phone, '') <> ''
      AND (
        regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
        OR (
          length(${digits}) >= 9
          AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 9
          AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = right(${digits}, 9)
        )
      )
    ORDER BY "createdAt" DESC
    LIMIT 1
  `
    .returnsRow(customerRow)
    .build();

  const result = await prisma.runtime().query(plan);
  const list = Array.isArray(result) ? result : [];
  return (list[0] as CustomerAccount | undefined) ?? null;
}

async function emailAvailableFor(email: string, userId: string | null) {
  if (!email) return null;
  const owner = await db.users.where({ email }).select("id").first();
  if (!owner || (userId && owner.id === userId)) return email;
  return null;
}

/** Find the customer for this phone, or create one. Email is stored only when it is free. */
export async function ensureCustomerAccount(input: {
  name: string;
  phone: string;
  email?: string | null;
}) {
  await ensureCustomerEmailNullable();

  const phone = input.phone.trim();
  const name = input.name.trim();
  const requestedEmail = (input.email ?? "").trim().toLowerCase();
  const existing = await findCustomerByPhone(phone);
  const email = await emailAvailableFor(requestedEmail, existing?.id ?? null);

  if (existing) {
    await db.users.where({ id: existing.id }).update({
      name: name || existing.name,
      phone,
      ...(email ? { email } : {}),
    });

    return {
      id: existing.id,
      name: name || existing.name,
      phone,
      email: email || existing.email || null,
    };
  }

  const created = await db.users.create({
    name,
    phone,
    role: "customer",
    email,
  });

  return {
    id: created.id,
    name: created.name,
    phone: created.phone,
    email: created.email,
  };
}
