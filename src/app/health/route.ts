import { getDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };

  try {
    await getDatabase().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "connected" }, { headers });
  } catch {
    return Response.json({ status: "unavailable", database: "unreachable" }, { status: 503, headers });
  }
}
