import Link from "next/link";

const items = [
  ["Overview", ""], ["My Team", "/team"], ["Draft", "/draft"],
  ["Matchups", "/matchups"], ["Standings", "/standings"], ["Waivers", "/waivers"], ["Trades", "/trades"], ["Settings", "/settings"], ["Scoring", "/scoring"],
] as const;

export function LeagueNav({ leagueId }: { leagueId: string }) {
  return <nav className="league-nav" aria-label="League"><ul>{items.map(([label, path]) =>
    <li key={label}><Link href={`/leagues/${leagueId}${path}`}>{label}</Link></li>,
  )}</ul></nav>;
}
