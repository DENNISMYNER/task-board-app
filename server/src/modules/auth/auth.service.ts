import argon2 from "argon2";
import { env } from "../../config/env";
import type { Prisma } from "../../generated/prisma/client";
import { ConflictError, UnauthorizedError } from "../../lib/errors";
import { generateRefreshToken, hashToken, signAccessToken } from "../../lib/jwt";
import { isUniqueViolation, prisma, type Db } from "../../lib/prisma";
import type { LoginInput, RegisterInput } from "./auth.schema";

// Never `select` or return passwordHash. This is the only shape of a user that leaves the API.
const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  jobTitle: true,
  timezone: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export interface SessionMeta {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// When the email doesn't exist we still run a password hash comparison against this dummy hash,
// so response time doesn't reveal which emails are registered (user enumeration via timing).
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash("not-a-real-password"));

async function createSession(db: Db, userId: string, meta: SessionMeta) {
  const { token, tokenHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent?.slice(0, 255),
      ipAddress: meta.ipAddress,
    },
  });

  return { accessToken: signAccessToken(userId), refreshToken: token, refreshExpiresAt };
}

export async function register(input: RegisterInput, meta: SessionMeta): Promise<AuthResult> {
  const passwordHash = await argon2.hash(input.password); // argon2id by default

  let user: PublicUser;
  try {
    user = await prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash },
      select: publicUserSelect,
    });
  } catch (err) {
    // The unique index is the source of truth; checking first and then inserting would race.
    if (isUniqueViolation(err)) {
      throw new ConflictError("An account with this email already exists", "EMAIL_TAKEN");
    }
    throw err;
  }

  return { user, ...(await createSession(prisma, user.id, meta)) };
}

export async function login(input: LoginInput, meta: SessionMeta): Promise<AuthResult> {
  const found = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, deletedAt: true },
  });

  const hash = found?.passwordHash ?? (await getDummyHash());
  const passwordOk = await argon2.verify(hash, input.password).catch(() => false);

  // One message for every failure: wrong email, wrong password, OAuth-only account, disabled account.
  if (!found || !found.passwordHash || found.deletedAt || !passwordOk) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const user = await prisma.user.update({
    where: { id: found.id },
    data: { lastLoginAt: new Date() },
    select: publicUserSelect,
  });

  return { user, ...(await createSession(prisma, user.id, meta)) };
}

/**
 * Refresh-token rotation: every refresh revokes the old token and issues a new one.
 * If an already-revoked token shows up again, someone is replaying a stolen token, so we
 * revoke every session of that user and force a fresh login.
 */
export async function refresh(token: string | undefined, meta: SessionMeta): Promise<AuthResult> {
  if (!token) throw new UnauthorizedError("Missing refresh token");

  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) throw new UnauthorizedError("Invalid session");

  if (session.revokedAt) {
    await prisma.session.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError("Session is no longer valid");
  }
  if (session.expiresAt <= new Date()) throw new UnauthorizedError("Session expired");

  return prisma.$transaction(async (tx) => {
    // Conditional update = atomic compare-and-swap. If two requests race, only one wins.
    const revoked = await tx.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new UnauthorizedError("Session is no longer valid");

    const user = await tx.user.findFirst({
      where: { id: session.userId, deletedAt: null },
      select: publicUserSelect,
    });
    if (!user) throw new UnauthorizedError("Account not found");

    return { user, ...(await createSession(tx, user.id, meta)) };
  });
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: publicUserSelect,
  });
  if (!user) throw new UnauthorizedError("Account not found");
  return user;
}
