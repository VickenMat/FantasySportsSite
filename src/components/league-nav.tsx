import Link from "next/link";

const items = [
  ["Overview", ""], ["My Team", "/team"], ["Players", "/players"],
  ["Matchups", "/matchups"], ["Standings", "/standings"], ["Waivers", "/waivers"], ["Settings", "/settings"],
  ["Trades", "/trades"], ["Scoring", "/scoring"],
] as const;

export function LeagueNav({ leagueId }: { leagueId: string }) {
  return <nav className="league-nav" aria-label="League"><ul>{items.map(([label, path]) =>
    <li key={label}><Link href={`/leagues/${leagueId}${path}`}>{label}</Link></li>,
  )}</ul></nav>;
}
