import type { Sport } from "@/generated/prisma/enums";

const tones: Record<Sport, Record<string, string>> = {
  NFL: { QB: "red", RB: "green", WR: "blue", TE: "orange" },
  NBA: { PG: "blue", SG: "purple", SF: "yellow", PF: "orange", C: "red" },
  NHL: { F: "yellow", D: "blue", G: "red" },
  MLB: { SP: "yellow", RP: "orange", C: "purple", "1B": "red", "2B": "green", "3B": "teal", SS: "blue", OF: "pink", DH: "brown" },
};

export function PositionBadges({ sport, positions }: { sport: Sport; positions: string[] }) {
  if (!positions.length) return <>N/A</>;
  return <span className="position-badges">{positions.map((position) => <span key={position} className={`position-badge tone-${tones[sport][position] ?? "neutral"}`}>{position}</span>)}</span>;
}
