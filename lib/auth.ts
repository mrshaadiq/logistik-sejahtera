import "server-only";

import { randomBytes, scryptSync, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

const SESSION_COOKIE_NAME = "logistik_sejahtera_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
};

type SessionRow = {
  id: number;
  user_id: number;
  expires_at: string;
};

export type AuthSession = {
  userId: number;
  username: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hashed = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hashed}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualHash.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expectedBuffer);
}

export async function hasRegisteredUsers() {
  const { count, error } = await supabaseAdmin
    .from("app_users")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to check users: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function findUserByUsername(username: string) {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id,username,password_hash")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load user: ${error.message}`);
  }

  return (data as UserRow | null) ?? null;
}

export async function createUser(username: string, password: string) {
  const passwordHash = hashPassword(password);
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .insert({
      username,
      password_hash: passwordHash,
    })
    .select("id,username,password_hash")
    .single();

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return data as UserRow;
}

export async function createSession(userId: number) {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  const { error } = await supabaseAdmin.from("app_sessions").insert({
    user_id: userId,
    token_hash: hashToken(rawToken),
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return {
    rawToken,
    expiresAt,
  };
}

export async function deleteSessionByToken(token: string) {
  const { error } = await supabaseAdmin
    .from("app_sessions")
    .delete()
    .eq("token_hash", hashToken(token));

  if (error) {
    throw new Error(`Failed to delete session: ${error.message}`);
  }
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from("app_sessions")
    .select("id,user_id,expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Failed to load session: ${sessionError.message}`);
  }

  const session = (sessionData as SessionRow | null) ?? null;

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin.from("app_sessions").delete().eq("id", session.id);
    return null;
  }

  const { data: userData, error: userError } = await supabaseAdmin
    .from("app_users")
    .select("id,username")
    .eq("id", session.user_id)
    .maybeSingle();

  if (userError) {
    throw new Error(`Failed to load session user: ${userError.message}`);
  }

  if (!userData) {
    return null;
  }

  return {
    userId: userData.id as number,
    username: userData.username as string,
  } satisfies AuthSession;
}

export async function requireAuth() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Sesi login tidak valid." }, { status: 401 });
  }

  return session;
}

export function applySessionCookie(response: NextResponse, rawToken: string, expiresAt: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: rawToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}
