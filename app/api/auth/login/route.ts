import { NextResponse } from "next/server";

import {
  applySessionCookie,
  createSession,
  findUserByUsername,
  verifyPassword,
} from "@/lib/auth";

type LoginPayload = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginPayload;
    const username = body.username?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username dan password wajib diisi." },
        { status: 400 },
      );
    }

    const user = await findUserByUsername(username);

    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 },
      );
    }

    const session = await createSession(user.id);
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
      },
    });

    applySessionCookie(response, session.rawToken, session.expiresAt);

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to login user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
