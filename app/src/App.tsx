import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Registry from "./Registry";
import Explorer from "./Explorer";
import { About, Contact, Faq, Home, Legal } from "./pages";

const LINKS: [string, string][] = [["", "Home"], ["registry", "Registry"], ["explorer", "Explorer"], ["about", "About"], ["legal", "Nepal & law"], ["faq", "FAQ"], ["contact", "Contact"]];
const route = () => window.location.hash.replace(/^#\/?/, "").split("/")[0];

export default function App() {
  const [r, setR] = useState(route());
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => { setR(route()); setOpen(false); window.scrollTo(0, 0); }; window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { threshold: 0.12 });
    const t = setTimeout(() => document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el)), 50);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [r]);

  const Page = { registry: Registry, explorer: Explorer, about: About, legal: Legal, faq: Faq, contact: Contact }[r as string] ?? Home;
  return (
    <>
      <nav className="nav">
        <a className="brand" href="#/"><svg width="26" height="26" viewBox="0 0 26 26" aria-hidden><path d="M3 20 9 5l9 3 5 11-9 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="13" cy="13" r="2.5" fill="currentColor" /></svg>EscrowLand</a>
        <button className="burger" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>☰</button>
        <ul className={open ? "links open" : "links"}>{LINKS.map(([h, t]) => <li key={h}><a href={`#/${h}`} className={r === h ? "active" : ""}>{t}</a></li>)}</ul>
        <span className="netpill"><i />Devnet</span>
        <WalletMultiButton />
      </nav>
      <Page />
      <footer>
        <div className="fgrid">
          <div><b>EscrowLand</b><p>A prototype showing how land transfer and payment could settle together on a public ledger.</p></div>
          <div><b>Explore</b>{LINKS.slice(1, 3).map(([h, t]) => <a key={h} href={`#/${h}`}>{t}</a>)}<a href="#/faq">FAQ</a></div>
          <div><b>Company</b><a href="#/about">About</a><a href="#/legal">Nepal &amp; law</a><a href="#/contact">Contact</a></div>
          <div><b>Official bodies</b><a href="https://dolma.gov.np" target="_blank" rel="noreferrer">Dept. of Land Management &amp; Archive</a><a href="https://www.nrb.org.np" target="_blank" rel="noreferrer">Nepal Rastra Bank</a></div>
        </div>
        <p className="fine">Not legal advice. A blockchain entry does not create, transfer or prove legal title in Nepal. © {new Date().getFullYear()} EscrowLand prototype.</p>
      </footer>
    </>
  );
}