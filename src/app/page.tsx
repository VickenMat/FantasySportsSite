import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { Brand } from "@/components/brand";
import { SportList } from "@/components/sports";
import { getAuth } from "@/lib/auth";

export default async function HomePage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return (
    <>
      <header className="site-header">
        <div className="shell topbar">
          <Brand />
          <nav aria-label="Main navigation" className="top-links">
            <a className="nav-link sports-link" href="#sports">Sports</a>
            {session ? <>
              <Link className="nav-link" href="/dashboard">Dashboard</Link>
              <Link className="button primary header-cta" href="/account">Account</Link>
            </> : <>
              <Link className="nav-link" href="/sign-in">Sign in</Link>
              <Link className="button primary header-cta" href="/sign-up">Register</Link>
            </>}
          </nav>
        </div>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-media">
            <Image src="/arena-hero.webp" alt="" fill priority sizes="(max-width: 760px) 100vw, 80vw" />
          </div>
          <div className="shell hero-copy">
            <p className="eyebrow">Multi-sport fantasy</p>
            <h1 className="display hero-title" id="hero-title">Four sports.<br /><em>One league.</em></h1>
            <p className="hero-description">Bring football, baseball, basketball and hockey together in a dynasty league, or stick with your favorite sport.</p>
            <div className="hero-actions">
              {session ? <>
                <Link href="/dashboard" className="button primary">Open dashboard</Link>
                <Link href="/account" className="button secondary">Manage account</Link>
              </> : <>
                <Link href="/sign-up" className="button primary">Create an account</Link>
                <Link href="/sign-in" className="button secondary">Sign in</Link>
              </>}
            </div>
          </div>
        </section>
        <section id="sports" className="shell sports-section" aria-labelledby="sports-title">
          <div className="section-heading">
            <h2 className="display" id="sports-title">Pick your playing field</h2>
            <p className="muted">Multi-sport dynasty and single-sport redraft</p>
          </div>
          <SportList />
        </section>
      </main>
      <footer className="site-footer"><div className="shell"><Brand /></div></footer>
    </>
  );
}
