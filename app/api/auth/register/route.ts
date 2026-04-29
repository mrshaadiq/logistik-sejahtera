import { NextResponse } from "next/server";

import {
  applySessionCookie,
  createSession,
  createUser,
  findUserByUsername,
  hasRegisteredUsers,
} from "@/lib/auth";

type RegisterPayload = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterPayload;
    const username = body.username?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!username || username.length < 4) {
      return NextResponse.json(
        { error: "Username minimal 4 karakter." },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password minimal 6 karakter." },
        { status: 400 },
      );
    }

    const [hasUsers, existingUser] = await Promise.all([
      hasRegisteredUsers(),
      findUserByUsername(username),
    ]);

    if (existingUser) {
      return NextResponse.json(
        { error: "Username sudah digunakan." },
        { status: 409 },
      );
    }

    if (!hasUsers) {
      // First account is allowed without prior authentication.
    }

    const user = await createUser(username, password);
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
      error instanceof Error ? error.message : "Failed to register user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
