import { db } from "../../../prisma/db";

export async function getMyRestaurant(restaurantId: string) {
  return db.orm.public.Restaurant
    .where({ id: restaurantId })
    .select("id", "name", "slug", "phone", "address", "createdAt", "updatedAt")
    .first();
}

export async function updateMyRestaurant(
  restaurantId: string,
  data: {
    name?: string;
    phone?: string;
    address?: string;
  }
) {
  const restaurant = await db.orm.public.Restaurant.where({ id: restaurantId }).first();

  if (!restaurant) {
    return null;
  }

  return db.orm.public.Restaurant.where({ id: restaurantId }).update({
    name: data.name?.trim(),
    phone: data.phone?.trim(),
    address: data.address?.trim(),
  });
}
