import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";
import type { Role, SessionUser } from "./permissions";

/**
 * Resolves the signed-in user. The JWT only proves identity; role and
 * permissions are always re-read from the database so that deactivation
 * or permission changes take effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    canOverridePrice: user.canOverridePrice,
    canAddProducts: user.canAddProducts,
  };
});

/** For server components / pages. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
