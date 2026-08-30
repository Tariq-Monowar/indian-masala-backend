import { db } from "../../../prisma/db";

export async function listStaff(restaurantId: string) {
  return db.orm.public.Staff
    .where({ restaurantId })
    .orderBy((staff) => staff.createdAt.desc())
    .all();
}

export async function getStaff(restaurantId: string, id: string) {
  return db.orm.public.Staff.where({ id, restaurantId }).first();
}

export async function createStaff(
  restaurantId: string,
  data: {
    name: string;
    phone?: string;
    role: string;
  }
) {
  return db.orm.public.Staff.create({
    name: data.name.trim(),
    phone: data.phone?.trim(),
    role: data.role.trim(),
    restaurantId,
  });
}

export async function updateStaff(
  restaurantId: string,
  id: string,
  data: {
    name?: string;
    phone?: string;
    role?: string;
  }
) {
  const staff = await db.orm.public.Staff.where({ id, restaurantId }).first();

  if (!staff) {
    return null;
  }

  return db.orm.public.Staff.where({ id, restaurantId }).update({
    name: data.name?.trim(),
    phone: data.phone?.trim(),
    role: data.role?.trim(),
  });
}

export async function deleteStaff(restaurantId: string, id: string) {
  const staff = await db.orm.public.Staff.where({ id, restaurantId }).first();

  if (!staff) {
    return null;
  }

  await db.orm.public.Staff.where({ id, restaurantId }).delete();

  return staff;
}
