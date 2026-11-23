import { getDatabase } from "@/lib/db";

async function main() {
  const database = getDatabase();
  try {
    await database.$queryRaw`SELECT 1`;
    console.info("Worker database connection verified.");
  } finally {
    await database.$disconnect();
  }
}

main().catch(() => {
  console.error("Worker could not connect to PostgreSQL.");
  process.exitCode = 1;
});
