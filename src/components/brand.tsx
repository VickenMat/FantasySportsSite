import Link from "next/link";
import { Zap } from "lucide-react";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="Fantasy Evolution home">
      <span className="brand-mark"><Zap size={19} fill="currentColor" aria-hidden /></span>
      <span>Fantasy<span className="brand-accent">Evolution</span></span>
    </Link>
  );
}
