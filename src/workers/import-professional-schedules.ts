import { readFile } from "node:fs/promises";
import { importProfessionalSchedules } from "@/server/scheduling";

const path = process.argv[2];
if (!path) throw new Error("Usage: npm run db:import:schedules -- <schedule-source.json>");

const result = await importProfessionalSchedules(JSON.parse(await readFile(path, "utf8")) as unknown);
console.log(JSON.stringify(result, null, 2));
