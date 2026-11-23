import Link from "next/link";
import { Brand } from "./brand";
import { SignOut } from "./sign-out";

export function DashboardHeader() {
  return (
    <header className="site-header">
      <div className="shell topbar">
        <Brand />
        <nav className="top-links" aria-label="Account navigation">
          <Link className="nav-link" href="/dashboard">Dashboard</Link>
          <SignOut />
        </nav>
      </div>
    </header>
  );
}
