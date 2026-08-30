import { hash, compare } from "bcryptjs";
import { db } from "../../../prisma/db";

type RegisterInput = {
  restaurantName: string;
  name: string;
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantId: string;
};

type AuthResult =
  | { user: AuthUser }
  | { statusCode: number; error: string };

export async function register(input: RegisterInput): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();

  const existingUser = await db.orm.public.User.where({ email }).first();

  if (existingUser) {
    return { statusCode: 409, error: "Email already registered" };
  }

  let slug = input.restaurantName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    slug = "restaurant";
  }

  const existingSlug = await db.orm.public.Restaurant.where({ slug }).first();

  if (existingSlug) {
    slug = `${slug}-${Date.now()}`;
  }

  const password = await hash(input.password, 10);

  const user = await db.transaction(async (tx) => {
    const restaurant = await tx.orm.public.Restaurant.create({
      name: input.restaurantName.trim(),
      slug,
    });

    return tx.orm.public.User.create({
      name: input.name.trim(),
      email,
      password,
      role: "owner",
      restaurantId: restaurant.id,
    });
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    },
  };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();

  const user = await db.orm.public.User.where({ email }).first();

  if (!user) {
    return { statusCode: 401, error: "Invalid email or password" };
  }

  const passwordMatch = await compare(input.password, user.password);

  if (!passwordMatch) {
    return { statusCode: 401, error: "Invalid email or password" };
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    },
  };
}
