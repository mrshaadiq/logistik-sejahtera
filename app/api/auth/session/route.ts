import { NextResponse } from "next/server";

import { getCurrentSession, hasRegisteredUsers } from "@/lib/auth";

export async function GET() {
  try {
    const [session, hasUsers] = await Promise.all([
      getCurrentSession(),
      hasRegisteredUsers(),
    ]);

    return NextResponse.json({
      authenticated: Boolean(session),
      setupRequired: !hasUsers,
      user: session,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load auth session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
