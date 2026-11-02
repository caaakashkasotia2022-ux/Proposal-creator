import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Converts Prisma Decimal (or null) to a JS number. */
export function num(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}

const isPostgres = /^postgres(ql)?:/.test(process.env.DATABASE_URL ?? "");

/** Case-insensitive "contains" filter on both SQLite (LIKE is already CI) and PostgreSQL. */
export function ilike(term: string): Prisma.StringFilter {
  return (isPostgres ? { contains: term, mode: "insensitive" } : { contains: term }) as Prisma.StringFilter;
}

export function numOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value.toString());
}
