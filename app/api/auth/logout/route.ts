import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { clearSessionCookie, deleteSessionByToken } from "@/lib/auth";

const SESSION_COOKIE_NAME = "logistik_sejahtera_session";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      await deleteSessionByToken(token);
    }

    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to logout user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
