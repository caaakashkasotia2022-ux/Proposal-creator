import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, parseBody, route } from "@/lib/api";
import { SESSION_COOKIE, sessionHours, signSession } from "@/lib/session";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

// Basic in-memory brute-force protection (per instance)
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;

export const POST = route(async (req) => {
  const { email, password } = await parseBody(req, schema);
  const key = `${email}|${req.headers.get("x-forwarded-for") ?? "local"}`;
  const a = attempts.get(key);
  if (a && a.count >= MAX_ATTEMPTS && a.until > Date.now()) {
    throw new ApiError(429, "Too many failed attempts. Please try again in 10 minutes.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    const next = { count: (a && a.until > Date.now() ? a.count : 0) + 1, until: Date.now() + LOCK_MS };
    attempts.set(key, next);
    throw new ApiError(401, user && !user.active ? "This account has been deactivated." : "Invalid email or password.");
  }
  attempts.delete(key);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionHours() * 3600,
  });
  return res;
});
