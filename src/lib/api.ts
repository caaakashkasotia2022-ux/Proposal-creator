import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getCurrentUser } from "./auth";
import type { SessionUser } from "./permissions";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const forbidden = (msg = "You do not have permission to perform this action.") => new ApiError(403, msg);
export const notFound = (msg = "Not found.") => new ApiError(404, msg);

export async function requireApiUser(check?: (u: SessionUser) => boolean, message?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Your session has expired. Please sign in again.");
  if (check && !check(user)) throw forbidden(message);
  return user;
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler with uniform error handling. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const path = first?.path.join(".");
        return NextResponse.json(
          { error: first ? `${path ? path + ": " : ""}${first.message}` : "Invalid input.", details: err.issues },
          { status: 400 },
        );
      }
      console.error("[api]", req.method, req.url, err);
      return NextResponse.json({ error: "Something went wrong on the server. Please try again." }, { status: 500 });
    }
  };
}

export async function audit(
  tx: { auditLog: { create: (args: { data: { userId?: string | null; action: string; entity: string; entityId?: string | null; details: string } }) => Promise<unknown> } },
  userId: string | null | undefined,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  await tx.auditLog.create({ data: { userId: userId ?? null, action, entity, entityId, details: JSON.stringify(details) } });
}
