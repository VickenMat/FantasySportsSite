import { getDatabase } from '@/lib/db';
import type { Sport } from '@/generated/prisma/enums';
import { getEligiblePositions } from './positions';
import { professionalTeamHistory } from './professional-team-history';

type ProjectionWhere = { category?: string; OR?: ProjectionWhere[]; publishedAt?: { lte: Date }; effectiveAt?: { lte: Date }; observedAt?: { lte: Date }; decisions?: { some?: { outcome?: string; targets?: { path?: string[]; equals?: unknown } } } };
type ProjectionQuery = { where?: ProjectionWhere; include?: { decisions?: { where?: { outcome?: string; decidedAt?: { lte: Date } }; take?: number } } };
/** Materialize the existing read models once per sport/pool. The in-memory clients
 * implement only their read selectors; both services retain their own policy rules.
 */
export async function currentPlayerEvidence(input: { playerIds: readonly string[]; sport: Sport; seasonYear: number; asOf: Date }) {
  const ids = new Set(input.playerIds), database = getDatabase();
  if (!ids.size) return new Map<string, { positions: string[]; positionsAvailable: boolean; positionSource: string | null; currentTeam: { code: string | null; displayName: string } | null; teamStatus: string }>();
  const [positions, observations] = await Promise.all([
    database.playerPositionEvidence.findMany({ where: { playerId: { in: [...ids] }, knownAt: { lte: input.asOf }, effectiveAt: { lte: input.asOf }, season: { sport: input.sport, startYear: { in: input.sport === 'MLB' ? [input.seasonYear-1,input.seasonYear] : [input.seasonYear] } } }, include: { season: { select: { startYear: true } }, position: { select: { code: true } } } }),
    database.professionalDataObservation.findMany({ where: { sport: input.sport, OR: [
      { category: { in: ['POSITION_REVISION','POSITION_AGGREGATE','TEAM_ASSIGNMENT'] }, publishedAt: { lte: input.asOf }, effectiveAt: { lte: input.asOf } },
      { category: { in: ['NBA_POSITION_SNAPSHOT','PLAYER_SNAPSHOT'] }, observedAt: { lte: input.asOf } },
    ] }, include: { decisions: { orderBy: { version: 'desc' } } }, orderBy: [{ revisionOrdinal: 'desc' },{ publishedAt: 'desc' },{ id: 'asc' }] }),
  ]);
  const positionsByPlayer = new Map<string, typeof positions>();
  for (const row of positions) positionsByPlayer.set(row.playerId,[...(positionsByPlayer.get(row.playerId) ?? []),row]);
  const observationsByPlayer = new Map<string, typeof observations>();
  const teamIds = new Set<string>();
  for (const row of observations) {
    const players = new Set<string>();
    for (const decision of row.decisions) {
      const targets = decision.targets as { playerId?: string; teamId?: string };
      if (targets.playerId && ids.has(targets.playerId)) { players.add(targets.playerId); if (targets.teamId) teamIds.add(targets.teamId); }
    }
    for (const playerId of players) observationsByPlayer.set(playerId,[...(observationsByPlayer.get(playerId) ?? []),row]);
  }
  const teams = teamIds.size ? await database.proTeam.findMany({ where: { id: { in: [...teamIds] }, sport: input.sport }, select: { id: true, code: true, displayName: true } }) : [];
  type Row = typeof observations[number];
  const matches = (row: Row, where: ProjectionWhere = {}): boolean => {
    if (where.category && row.category !== where.category || where.OR && !where.OR.some(value => matches(row,value))) return false;
    for (const field of ['publishedAt','effectiveAt','observedAt'] as const) if (where[field] && (!row[field] || row[field]! > where[field]!.lte)) return false;
    const some = where.decisions?.some;
    if (some && !row.decisions.some(value => {
      if (some.outcome && value.outcome !== some.outcome) return false;
      if (some.targets) {
        let target: unknown = value.targets;
        for (const key of some.targets.path ?? []) target = target && typeof target === 'object' ? (target as Record<string,unknown>)[key] : undefined;
        if (target !== some.targets.equals) return false;
      }
      return true;
    })) return false;
    return true;
  };
  const values = await Promise.all([...ids].map(async playerId => {
    const rows = observationsByPlayer.get(playerId) ?? [];
    const client = {
      playerPositionEvidence: { findMany: async () => positionsByPlayer.get(playerId) ?? [] },
      professionalDataObservation: { findMany: async (query: ProjectionQuery) => rows.filter(row => matches(row,query.where)).map(row => {
        const filter = query.include?.decisions?.where;
        const decisions = row.decisions.filter(value => (!filter?.outcome || value.outcome === filter.outcome) && (!filter?.decidedAt || value.decidedAt <= filter.decidedAt.lte));
        return { ...row, decisions: query.include?.decisions?.take === undefined ? decisions : decisions.slice(0,query.include.decisions.take) };
      }) },
      proTeam: { findMany: async (query: { where: { id: { in: string[] } } }) => teams.filter(row => query.where.id.in.includes(row.id)) },
    };
    const eligibility = await getEligiblePositions({ playerId, sport: input.sport, seasonYear: input.seasonYear, asOf: input.asOf },client as unknown as NonNullable<Parameters<typeof getEligiblePositions>[1]>);
    const team = await professionalTeamHistory({ playerId, sport: input.sport, asOf: input.asOf },client as unknown as NonNullable<Parameters<typeof professionalTeamHistory>[1]>);
    const provenance = 'nbaPositionProvenance' in eligibility ? eligibility.nbaPositionProvenance ?? [] : [];
    const specific = provenance.some(row => !row.retracted && row.classification === 'EXPLICIT' && row.derivedFantasyPositions?.slice().sort().join('|') === eligibility.positions.slice().sort().join('|'));
    const mapped = !specific && provenance.some(row => !row.retracted && row.classification === 'FAMILY_DERIVED');
    const currentTeam = team.status === 'SOURCE_RECORDED' ? team.current?.assignment === 'FREE_AGENT' ? { code: 'FA', displayName: 'Free agent' } : team.current?.team ?? null : null;
    return [playerId,{ positions: eligibility.positions, positionsAvailable: eligibility.available, positionSource: eligibility.positions.length ? mapped ? 'Mapped' : 'Verified' : null, currentTeam, teamStatus: team.status }] as const;
  }));
  return new Map(values);
}
