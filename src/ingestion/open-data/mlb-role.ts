/** Confirmed policy: starting pitcher first; otherwise batting, then proven exclusive pitching.
 * Positive participation can select a role; absence requires a complete-game source.
 */
export function provenMlbRole(input: { bats: boolean; pitches: boolean; plateAppearances: number | null; pitchingGames: number | null; pitchingStarts: number | null; complete: boolean }) {
  const { bats, pitches, plateAppearances, pitchingGames, pitchingStarts, complete } = input;
  if (pitchingStarts !== null && pitchingStarts !== 0 && pitchingStarts !== 1) return null;
  if (pitches && (pitchingGames ?? 0) > 0 && pitchingStarts === 1) return 'PITCHER' as const;
  if (bats && (plateAppearances ?? 0) > 0 && (pitchingStarts === 0 || pitchingGames === 0)) return 'HITTER' as const;
  if (complete && pitches && !bats && plateAppearances === 0 && (pitchingGames ?? 0) > 0) return 'PITCHER' as const;
  return null;
}
