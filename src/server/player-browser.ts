import { playerPage } from "./draft";
import { playerStatistics, type PlayerStatistics } from "./player-statistics";

/** Shared canonical browser: score filtering and sorting precede pagination. */
export async function browsePlayers(leagueId: string, options: NonNullable<Parameters<typeof playerPage>[1]> & {
  presetId: string; seasonId: string; asOf?: Date; sort?: string; points?: string;
}) {
  const global = ["PTS", "AVG"].includes(options.sort ?? "") || ["KNOWN", "UNKNOWN"].includes(options.points ?? "");
  const pool = await playerPage(leagueId, { ...options, allResults: global });
  const statistics = new Map<string, PlayerStatistics>();
  for (let offset = 0; offset < pool.items.length; offset += 250) {
    const values = await playerStatistics({ playerIds: pool.items.slice(offset, offset + 250).map(({ id }) => id), presetId: options.presetId, seasonId: options.seasonId, asOf: options.asOf });
    for (const [id, value] of values) statistics.set(id, value);
  }
  if (!global) return { ...pool, statistics };
  const filtered = pool.items.filter(({ id }) => options.points === "KNOWN" ? statistics.get(id)?.totalTenths != null : options.points === "UNKNOWN" ? statistics.get(id)?.totalTenths == null : true);
  if (["PTS", "AVG"].includes(options.sort ?? "")) filtered.sort((a, b) => {
    const left = options.sort === "PTS" ? statistics.get(a.id)?.totalTenths : statistics.get(a.id)?.averageTenths;
    const right = options.sort === "PTS" ? statistics.get(b.id)?.totalTenths : statistics.get(b.id)?.averageTenths;
    return left == null ? right == null ? a.id.localeCompare(b.id) : 1 : right == null ? -1 : left === right ? a.id.localeCompare(b.id) : left > right ? -1 : 1;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pool.pageSize)); const page = Math.min(pool.page, pages);
  return { ...pool, page, pages, total: filtered.length, statistics, items: filtered.slice((page - 1) * pool.pageSize, page * pool.pageSize) };
}
