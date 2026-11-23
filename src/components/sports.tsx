import { CircleDot, Disc3, Dribbble, Shield } from "lucide-react";
import type { Sport } from "@/generated/prisma/enums";

const sports = {
  NFL: { name: "Football", icon: Shield },
  MLB: { name: "Baseball", icon: CircleDot },
  NBA: { name: "Basketball", icon: Dribbble },
  NHL: { name: "Hockey", icon: Disc3 },
};

export function SportList() {
  return (
    <ul className="sports-grid">
      {(Object.keys(sports) as Sport[]).map((sport) => {
        const { name, icon: Icon } = sports[sport];
        return (
          <li className="sport-tile" key={sport} data-sport={sport}>
            <span className="sport-icon"><Icon size={25} strokeWidth={1.7} aria-hidden /></span>
            <div>
              <p className="sport-code">{sport}</p>
              <p className="muted">{name}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SportTags({ values }: { values: Sport[] }) {
  return (
    <ul className="sport-tags" aria-label="League sports">
      {values.map((sport) => <li data-sport={sport} key={sport}>{sport}</li>)}
    </ul>
  );
}
