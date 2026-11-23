import { Brand } from "./brand";

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="site-header"><div className="shell topbar"><Brand /></div></header>
      <main id="main" className="auth-layout">
        <section className="auth-card" aria-labelledby="auth-title">
          <h1 className="display" id="auth-title">{title}</h1>
          {children}
        </section>
      </main>
    </>
  );
}
