import { readFile } from "node:fs/promises";
import { getDatabase } from "@/lib/db";
import { reconcileHistoricalPositions } from "@/server/historical-position-reconciliation";

const [path, ...args] = process.argv.slice(2);
try {
  if (!path) throw new Error("Pass a verified position repair JSON manifest. Default mode is read-only dry run.");
  const fingerprint = args.find((arg) => arg.startsWith("--expected-fingerprint="))?.split("=")[1];
  if (args.includes("--apply") && !fingerprint) throw new Error("Apply requires separately approved --expected-fingerprint=SHA256.");
  const databaseName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (!["fantasy_evolution", "fantasy_evolution_test"].includes(databaseName)) throw new Error("Only the established development and disposable test environments are supported.");
  console.log(JSON.stringify(await reconcileHistoricalPositions(JSON.parse(await readFile(path, "utf8")), args.includes("--apply") ? { expectedFingerprint: fingerprint! } : undefined), null, 2));
} finally { await getDatabase().$disconnect(); }
