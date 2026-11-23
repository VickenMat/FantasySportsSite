import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalDatabase = globalThis as typeof globalThis & { prisma?: PrismaClient };

export function getDatabase() {
  if (!globalDatabase.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required.");

    const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 3_000 });
    globalDatabase.prisma = new PrismaClient({ adapter });
  }

  return globalDatabase.prisma;
}
