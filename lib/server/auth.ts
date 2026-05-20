import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { User } from "@/generated/prisma";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "dayfold_session";
const SESSION_TTL_DAYS = 30;

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function getSessionSecret() {
  const secret = process.env.DAYFOLD_SESSION_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("Missing DAYFOLD_SESSION_SECRET.");
  }

  return secret ?? "dayfold-dev-secret-change-me";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, stored] = storedHash.split(":");
  if (!salt || !stored) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(stored, "hex");

  if (storedBuffer.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derived);
}

function hashSessionToken(token: string) {
  return createHash("sha256")
    .update(`${getSessionSecret()}:${token}`)
    .digest("hex");
}

async function issueSessionCookie(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/"
  });
}

export async function clearCurrentSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    await db.session.deleteMany({
      where: {
        tokenHash: hashSessionToken(rawToken)
      }
    });
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/"
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await db.session.delete({
      where: {
        id: session.id
      }
    });
    return null;
  }

  return session.user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError("请先登录。", 401);
  }

  return user;
}

async function findLegacyDemoUser() {
  if (process.env.DAYFOLD_CLAIM_LEGACY_DEMO_USER !== "true") {
    return null;
  }

  const legacyEmail = process.env.DAYFOLD_DEV_USER_EMAIL ?? "demo@dayfold.local";

  return db.user.findFirst({
    where: {
      email: legacyEmail,
      passwordHash: null
    }
  });
}

export async function signUp(params: {
  email: string;
  name: string;
  password: string;
}) {
  const email = normalizeEmail(params.email);
  const name = normalizeName(params.name);
  const passwordHash = hashPassword(params.password);

  const existing = await db.user.findUnique({
    where: { email }
  });

  if (existing?.passwordHash) {
    throw new AuthError("这个邮箱已经注册过了，请直接登录。", 409);
  }

  let user: User;

  if (existing && !existing.passwordHash) {
    user = await db.user.update({
      where: { id: existing.id },
      data: {
        name,
        passwordHash
      }
    });
  } else {
    const legacyDemoUser = await findLegacyDemoUser();

    if (legacyDemoUser && legacyDemoUser.email !== email) {
      user = await db.user.update({
        where: { id: legacyDemoUser.id },
        data: {
          email,
          name,
          passwordHash
        }
      });
    } else {
      user = await db.user.create({
        data: {
          email,
          name,
          passwordHash
        }
      });
    }
  }

  await issueSessionCookie(user.id);
  return user;
}

export async function signIn(params: {
  email: string;
  password: string;
}) {
  const email = normalizeEmail(params.email);
  const user = await db.user.findUnique({
    where: { email }
  });

  if (!user?.passwordHash || !verifyPassword(params.password, user.passwordHash)) {
    throw new AuthError("邮箱或密码不正确。", 401);
  }

  await issueSessionCookie(user.id);
  return user;
}
