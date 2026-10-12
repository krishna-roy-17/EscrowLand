import { useEffect, useRef, useState, type ReactNode } from "react";
import { getProgram, PID } from "./chain";
import { TxTable } from "./Explorer";

const Sec = ({ title, children, id }: { title: string; children: ReactNode; id?: string }) => <section className="sec reveal" id={id}><h2>{title}</h2>{children}</section>;
const Page = ({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) => <div className="shell page"><h1 className="ptitle">{title}</h1>{lead && <p className="lead">{lead}</p>}{children}</div>;

const STEPS = [["1", "Register", "The registrar records the parcel: ID, location, area and a fingerprint of the deed."], ["2", "List", "The owner names one buyer and a fixed price. No open bidding, no surprises."], ["3", "Deposit", "The buyer's payment goes into escrow. Nobody holds the key, the program does."], ["4", "Settle", "On the registrar's approval, ownership and payment change hands in one step, or nothing does."]];
const FEATS = [["Atomic settlement", "Title and payment move in the same transaction. No half-finished sales."], ["Non-custodial escrow", "Funds sit in an account controlled only by program rules."], ["Safe refunds", "Rejected, cancelled or timed-out deals return the buyer's money."], ["Parcel locks", "Mortgage, dispute and court-order locks stop any sale while they last."], ["Public verification", "Anyone can check a parcel's owner and history, no account needed."], ["Deed fingerprinting", "Upload a document to check it matches the hash recorded on-chain."]];

const BLOB = "M0 -100 C60 -105 110 -55 105 5 C100 65 50 105 -10 100 C-70 95 -110 45 -102 -15 C-95 -75 -55 -96 0 -100Z";
const RIGHT = [0.5, 0.75, 1, 1.3, 1.65, 2.05], LEFT = [0.6, 0.9, 1.25, 1.7];
const PARCELS = ["800,120 980,90 1060,210 940,280 820,230", "690,430 840,400 900,520 760,580", "120,200 290,170 330,300 190,350"];
const PINS: [number, number, number][] = [[980, 90, 0], [940, 280, 0.6], [840, 400, 3], [190, 350, 6]];

/** Animated survey scene: flowing contour lines, parcel boundaries that draw themselves, pulsing survey pins, a scanning sweep. */
function HeroArt() {
  return (
    <svg className="heroart" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <path id="blob" d={BLOB} vectorEffect="non-scaling-stroke" />
        <linearGradient id="scanGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#9BE3BA" stopOpacity="0" /><stop offset="1" stopColor="#9BE3BA" stopOpacity="0.2" /></linearGradient>
      </defs>
      <g className="contours">
        {RIGHT.map((k, i) => <use key={"r" + i} href="#blob" className="ct" style={{ "--d": `${22 + i * 5}s` } as any} transform={`translate(930 310) scale(${k})`} />)}
        {LEFT.map((k, i) => <use key={"l" + i} href="#blob" className="ct" style={{ "--d": `${28 + i * 6}s` } as any} transform={`translate(170 610) scale(${k})`} />)}
      </g>
      {PARCELS.map((pts, i) => <polygon key={i} points={pts} pathLength={1} className="parcel" style={{ "--dl": `${i * 3}s` } as any} />)}
      {PINS.map(([x, y, d]) => <g key={x} transform={`translate(${x} ${y})`}><circle className="ping" r="5" style={{ "--dl": `${d}s` } as any} /><circle className="pin" r="3" /></g>)}
      <text className="coord" x="992" y="76" style={{ "--dl": "0s" } as any}>27.7172°N  85.3240°E</text>
      <text className="coord" x="852" y="392" style={{ "--dl": "3s" } as any}>28.2096°N  83.9856°E</text>
      <rect className="scan" x="0" y="0" width="200" height="700" fill="url(#scanGrad)" />
    </svg>
  );
}

function CountUp({ n }: { n: number | null }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (n === null) return;
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 1100); setV(Math.round(n * k)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <>{n === null ? "…" : v}</>;
}

const TICKER = ["Lalpurja · लालपुर्जा", "Kitta number · कित्ता नं.", "Naksha · नक्सा", "Malpot Karyalaya · मालपोत कार्यालय", "Rajinama · राजीनामा", "Dristibandhak · दृष्टिबन्धक", "Ropani · रोपनी", "Bigha · बिघा"];
const PageHero = ({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) => <><header className="phero"><PhArt /><div className="shell"><h1>{title}</h1>{lead && <p>{lead}</p>}</div></header><div className="shell page">{children}</div></>;

const PhArt = () => (
  <svg className="phart" viewBox="0 0 600 220" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
    {[0.7, 1.05, 1.4].map((k, i) => <path key={i} d={BLOB} className="ct" vectorEffect="non-scaling-stroke" style={{ "--d": `${20 + i * 6}s` } as any} transform={`translate(430 110) scale(${k})`} />)}
    <polygon points="360,60 470,40 520,120 440,170 370,130" pathLength={1} className="parcel" />
    <g transform="translate(470 40)"><circle className="ping" r="5" /><circle className="pin" r="3" /></g>
  </svg>
);

function StatNum({ to, suffix = "", label }: { to: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => { const k = Math.min(1, (t - t0) / 1200); setV(Math.round(to * k)); if (k < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(ref.current!);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <div className="bigstat" ref={ref}><b>{v}{suffix}</b><span>{label}</span></div>;
}

export function Home() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { (getProgram().account as any).parcel.all().then((a: any[]) => setN(a.length)).catch(() => setN(null)); }, []);
  return (
    <>
      <header className="hero">
        <HeroArt />
        <div className="shell herobody">
          <span className="tag">Devnet prototype · Built around Nepal's land records</span>
          <h1>Land that changes hands only when the money does.</h1>
          <p>EscrowLand shows how a land registry and a payment escrow can settle in one transaction, so a buyer never pays without getting the title, and a seller never hands over title without payment.</p>
          <div className="cta"><a className="btn" href="#/registry">Open the registry</a><a className="btn alt" href="#/explorer">Explore the ledger</a></div>
          <div className="statrow hero-stats"><div className="stat"><b><CountUp n={n} /></b><span>Parcels registered</span></div><div className="stat"><b>1</b><span>Transaction per settlement</span></div><div className="stat"><b>0</b><span>Intermediaries holding funds</span></div></div>
        </div>
      </header>
      <div className="ticker" aria-hidden="true"><div className="track">{[...TICKER, ...TICKER].map((t, i) => <span key={i}>{t}</span>)}</div></div>
      <div className="shell">
        <Sec title="How a sale works"><div className="grid4">{STEPS.map(([n, t, d]) => <div className="card step" key={n}><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></div>)}</div></Sec>
        <Sec title="What it gives you"><div className="grid3">{FEATS.map(([t, d]) => <div className="card" key={t}><h3>{t}</h3><p>{d}</p></div>)}</div></Sec>
        <Sec title="A usual sale vs EscrowLand"><div className="grid2">
          <div className="card bad"><h3>A usual sale</h3><ul className="ticks"><li>Money can move before the title does</li><li>Records are slow to check</li><li>A parcel can be sold twice</li><li>A mortgaged parcel can still be sold</li></ul></div>
          <div className="card good"><h3>With EscrowLand</h3><ul className="ticks"><li>Title and payment settle together</li><li>Anyone can verify a parcel in seconds</li><li>One active deal per parcel</li><li>Locks block sales until lifted</li></ul></div></div></Sec>
        <Sec title="Who it is for"><div className="grid3">
          <div className="card"><h3>Owners</h3><p>List a parcel for one named buyer at a fixed price, and follow it to settlement.</p><a href="#/registry">Open the registry</a></div>
          <div className="card"><h3>Buyers</h3><p>Pay into escrow knowing the money only moves when the title does.</p><a href="#/faq">How refunds work</a></div>
          <div className="card"><h3>Registrars</h3><p>Register parcels, approve or reject sales, and place locks.</p><a href="#/about">See the roles</a></div></div></Sec>
        <Sec title="Live from the ledger"><div className="card"><TxTable address={PID} limit={5} title="Latest registry activity" /></div><p className="mute"><a href="#/explorer">Open the full explorer</a></p></Sec>
        <section className="ctaband reveal"><h2>Try a sale in five minutes</h2><p>Register a parcel, list it, deposit and settle, all on the test network.</p><div className="cta"><a className="btn" href="#/registry">Open the registry</a><a className="btn alt" href="#/faq">Read the FAQ</a></div></section>
      </div>
    </>);
}

const ROLES: [string, string, string][] = [["R", "Registrar", "Stands in for the Land Revenue Office. Registers parcels, approves or rejects funded sales, and places locks."], ["O", "Owner", "Lists a parcel for one named buyer at a fixed price, and can cancel before it settles."], ["B", "Buyer", "Deposits the exact price into escrow, and can claim a refund if the sale does not settle."], ["L", "Lender", "Places a mortgage lock on a parcel and lifts it once the loan is cleared."]];
const GUARDS: [string, string][] = [["Only the registrar registers land", "Nobody else can add a parcel to the registry."], ["One named buyer, one fixed price", "Only the buyer the owner chose can accept the listing."], ["Exact payment into escrow", "The buyer deposits the full price. The program holds it, no person does."], ["Locked parcels cannot be sold", "Mortgage, dispute and court-order locks block listing, deposits and approval."], ["Settle together or not at all", "Approval moves the title, the seller's payment and the fee in one transaction."], ["Money always has a way back", "A rejection, cancellation, timeout or new lock lets the buyer claim a refund."]];
const BUILT = ["Rust and Anchor", "Solana Devnet", "React and TypeScript", "Phantom and Solflare", "OpenStreetMap and Leaflet", "SHA-256 deed fingerprints"];

export const About = () => (
  <PageHero title="About EscrowLand" lead="A working model of faster, safer land transfers, built as a study project to test the idea.">
    <Sec title="From trust to proof">
      <div className="split">
        <div className="card flowcard"><span className="kicker">The problem</span><h3>Someone always goes first</h3><p>Either the buyer pays before the title moves, or the seller hands over the title before the money arrives. Records are slow to check, and a parcel can be sold twice or sold while mortgaged.</p></div>
        <div className="arrowmid" aria-hidden="true">→</div>
        <div className="card flowcard accent"><span className="kicker">The idea</span><h3>Make both sides move together</h3><p>Put the registry rules and the escrow in one program on a public ledger. It refuses to settle unless the parcel is unlocked and the payment is in escrow, then it moves both at once.</p></div>
      </div>
    </Sec>
    <Sec title="By the numbers"><div className="statband stagger"><StatNum to={1} label="Transaction settles a sale" /><StatNum to={3} label="Lock types: mortgage, dispute, court order" /><StatNum to={7} suffix=" days" label="Default refund window" /><StatNum to={1} suffix="%" label="Default registration fee" /></div></Sec>
    <Sec title="Who does what"><div className="grid4">{ROLES.map(([l, t, d]) => <div className="card role" key={t}><div className="ico"><b>{l}</b></div><h3>{t}</h3><p>{d}</p></div>)}</div></Sec>
    <Sec title="What the program enforces"><ol className="tl">{GUARDS.map(([t, d], i) => <li key={t} style={{ "--i": i } as any}><span className="dot2">{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>)}</ol></Sec>
    <Sec title="Built with"><div className="chips">{BUILT.map((t, i) => <span className="chip" key={t} style={{ "--i": i } as any}>{t}</span>)}</div></Sec>
    <Sec title="A study project"><div className="callout">EscrowLand runs on a test network and has no legal effect. Real land records in Nepal are kept by the Land Revenue Office. <a href="#/legal">Read the Nepal and law notice</a>.</div></Sec>
    <section className="ctaband reveal"><h2>See it work</h2><p>Register a parcel and take it through a full sale on the test network.</p><div className="cta"><a className="btn" href="#/registry">Open the registry</a><a className="btn alt" href="#/explorer">Explore the ledger</a></div></section>
  </PageHero>);

const TERMS: [string, string, string][] = [["Lalpurja (लालपुर्जा)", "Land ownership certificate issued by the Land Revenue Office", "Parcel record with owner and deed fingerprint"], ["Kitta number (कित्ता नं.)", "Parcel number shown on the cadastral map", "Parcel ID"], ["Naksha (नक्सा)", "Cadastral map of parcels", "Map view"], ["Malpot Karyalaya (मालपोत कार्यालय)", "Land Revenue Office that registers land and its transfers", "Registrar role"], ["Rajinama (राजीनामा)", "Deed of transfer agreed by seller and buyer", "A deal"], ["Dristibandhak (दृष्टिबन्धक)", "Mortgage of land", "Mortgage lock"]];
export const Legal = () => (
  <Page title="Nepal and the law" lead="Read this before you use or show this site. It explains what this prototype is, and is not.">
    <Sec title="This is a prototype"><p>EscrowLand is a study project that runs on Solana Devnet, a test network. Devnet SOL, paid from your Phantom wallet, has no monetary value, and records on it have no legal effect. Do not use it for real land, real money or real parties.</p></Sec>
    <Sec title="Cryptocurrency is prohibited in Nepal"><p>Nepal Rastra Bank has repeatedly stated that cryptocurrency transactions are illegal in Nepal, and its notices also name stablecoins. It has warned that anyone involved in use, transfer, exchange or mining can be punished under law. Because the escrow is paid in SOL, a cryptocurrency, a real deployment in Nepal as designed would not be lawful today.</p></Sec>
    <Sec title="Legal title stays with the Land Revenue Office"><p>In Nepal, ownership is recorded and transferred through the Land Revenue Office (Malpot Karyalaya), which issues the lalpurja. A blockchain entry does not create, transfer or prove title. Land is governed by Nepali statutes such as the Land Act and the Land Revenue Act, together with their amendments and rules. Taxes, fees, restrictions on certain land types and registration formalities are set by law and change over time. Confirm the current rules with the local Land Revenue Office or a Nepali advocate.</p></Sec>
    <Sec title="How the ideas map to Nepali records"><div className="scroll"><table><thead><tr><th>Nepali term</th><th>Meaning</th><th>In this prototype</th></tr></thead><tbody>{TERMS.map((r) => <tr key={r[0]}>{r.map((c) => <td key={c}>{c}</td>)}</tr>)}</tbody></table></div>
      <p className="mute">Areas are stored in square metres. For orientation: 1 ropani is about 508.7 m², and 1 bigha is about 6,772.6 m² (20 kattha per bigha).</p></Sec>
    <Sec title="What a lawful version would need"><ul><li>Legal recognition of digital land records, and a role for the Land Revenue Office as the authority.</li><li>Settlement in Nepali rupees through licensed banks or payment providers, not through a cryptocurrency.</li><li>Approval from the relevant regulators, including Nepal Rastra Bank.</li><li>Identity checks, tax handling and the legal formalities for each transfer.</li></ul></Sec>
    <Sec title="Privacy"><p>This website does not ask for your name, phone or email, and sets no tracking. Wallet addresses, parcels and transactions on a blockchain are public and permanent. Your browser loads map tiles from OpenStreetMap and fonts from Google Fonts.</p></Sec>
    <Sec title="Terms of use"><p>This prototype is provided as is, with no warranty. Nothing here is legal, tax or financial advice. You are responsible for following the laws that apply to you.</p></Sec>
  </Page>);

const QA: [string, string][] = [["What is EscrowLand?", "A prototype that settles a land transfer and its payment in one step, using a public ledger."], ["Is it legal to use in Nepal?", "No, not as designed. Nepal Rastra Bank prohibits cryptocurrency, including stablecoins. Use it only as a demonstration on a test network."], ["Does it replace the lalpurja?", "No. Legal ownership in Nepal is recorded by the Land Revenue Office. A blockchain record has no legal effect."], ["Why is there a registrar?", "Someone trusted has to check the deed and approve each sale. In a real system that would be the Land Revenue Office."], ["What if the registrar rejects a sale?", "The parcel is freed and the buyer can claim their deposit back. Deposits are also returnable after the time limit."], ["What are locks?", "A lock marks a parcel as mortgaged, disputed or under a court order. A locked parcel cannot be sold or funded until the lock is lifted."], ["Do I need to own cryptocurrency?", "To try it you need a Phantom or Solflare wallet on Devnet, with free Devnet SOL."], ["Is my information public?", "Wallet addresses and transactions are public on the blockchain. The site itself collects no personal details."], ["Can I use real money or real land?", "No. Please don't."]];
export const Faq = () => <Page title="Frequently asked questions">{QA.map(([q, a]) => <details className="faq reveal" key={q}><summary>{q}</summary><p>{a}</p></details>)}</Page>;

const TOPICS = ["Question", "Problem report", "Feedback", "Collaboration"];
export function Contact() {
  const to = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
  const [topic, setTopic] = useState(TOPICS[0]);
  const [status, setStatus] = useState<"idle" | "nomail" | "sent">("idle");
  const [len, setLen] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!to) { setStatus("nomail"); return; }
    const f = new FormData(e.currentTarget);
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(`[${topic}] ${f.get("subject")}`)}&body=${encodeURIComponent(`${f.get("message")}\n\nFrom: ${f.get("name")}`)}`;
    formRef.current?.reset(); setLen(0); setStatus("sent");
  };
  return (
    <PageHero title="Contact" lead="Questions, feedback or a problem to report. Tell us what you need.">
      <div className="cgrid">
        <div className="card cform reveal">
          {status === "sent" ? (
            <div className="done"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" pathLength={1} /><path d="M20 33l9 9 16-18" pathLength={1} /></svg><h3>Your email app should open</h3><p>Send the message from there to finish.</p><button className="ghost" onClick={() => setStatus("idle")}>Write another</button></div>
          ) : (
            <form ref={formRef} onSubmit={submit}>
              <h2>Send a message</h2>
              <div className="pills" role="group" aria-label="Topic">{TOPICS.map((t) => <button type="button" key={t} className="pill2" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t}</button>)}</div>
              <input name="name" placeholder="Your name" required /><input name="subject" placeholder="Subject" required />
              <textarea name="message" placeholder="How can we help?" rows={6} maxLength={1000} required onChange={(e) => setLen(e.target.value.length)} />
              <span className="counter">{len} / 1000</span>
              <button className="sendbtn">Send message</button>
              {status === "nomail" && <p className="msg pop">No contact email is set up yet. The site owner needs to add VITE_CONTACT_EMAIL.</p>}
            </form>)}
        </div>
        <aside className="cside stagger reveal">
          <div className="card"><h3>Real land matters</h3><p>This site cannot help with land records. Contact your local Land Revenue Office (Malpot Karyalaya) or the Department of Land Management and Archive.</p><a href="https://dolma.gov.np" target="_blank" rel="noreferrer">dolma.gov.np</a></div>
          <div className="card"><h3>Reporting a problem</h3><p>Please include:</p><ol className="steps"><li>The parcel ID</li><li>The transaction signature from the explorer</li><li>What you expected, and what happened</li></ol></div>
          <div className="tiles"><a href="#/faq">FAQ <span>→</span></a><a href="#/explorer">Explorer <span>→</span></a><a href="#/legal">Law <span>→</span></a></div>
        </aside>
      </div>
    </PageHero>);
}
