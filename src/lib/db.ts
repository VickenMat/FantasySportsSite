import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalDatabase = globalThis as typeof globalThis & { prisma?: PrismaClient };

export function getDatabase() {
  if (!globalDatabase.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required.");

    const configuredMaximum = Number(process.env.DATABASE_POOL_MAX ?? "10");
    const maximum = Number.isInteger(configuredMaximum) && configuredMaximum >= 1 && configuredMaximum <= 50 ? configuredMaximum : 10;
    const adapter = new PrismaPg({
      connectionString, connectionTimeoutMillis: 3_000, max: maximum,
      idleTimeoutMillis: 30_000, allowExitOnIdle: process.env.NODE_ENV === "test",
    });
    globalDatabase.prisma = new PrismaClient({ adapter });
  }

  return globalDatabase.prisma;
}
