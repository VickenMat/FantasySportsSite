import Link from "next/link";
import { Brand } from "./brand";
import { SignOut } from "./sign-out";

export function DashboardHeader() {
  return (
    <header className="site-header">
      <div className="shell topbar">
        <Brand href="/" />
        <nav className="top-links" aria-label="Account navigation">
          <Link className="nav-link" href="/leagues/new">Create league</Link>
          <Link className="nav-link" href="/leagues/discover">Discover</Link>
          <Link className="nav-link" href="/analysis">Analysis</Link>
          <Link className="nav-link" href="/dashboard">Dashboard</Link>
          <Link className="nav-link" href="/account">Account</Link>
          <SignOut />
        </nav>
      </div>
    </header>
  );
}
