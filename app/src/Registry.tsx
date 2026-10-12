import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { TxTable } from "./Explorer";
import { PublicKey } from "@solana/web3.js";
import { BN, configPda, dealPda, dealState, DECIMALS, ENC, EXPLORER, getProgram, parcelColor, parcelPda, sha256 } from "./chain";

const short = (k: any) => `${k.toString().slice(0, 4)}…${k.toString().slice(-4)}`;
const usdc = (n: any) => (Number(n.toString()) / DECIMALS).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const STATUS: Record<string, string> = {
  listed: "Listed. Waiting for the buyer to deposit.", funded: "Funds locked. Waiting for the registrar.",
  completed: "Sold. Title and payment moved together.", cancelled: "Cancelled by the seller.",
  rejected: "Rejected by the registrar. The buyer can reclaim the funds.", expired: "Timed out. Funds went back to the buyer.", refunded: "Refunded to the buyer.",
};
const LEGEND: [string, string][] = [["#2E8B57", "Free"], ["#C98A00", "Mortgaged"], ["#C23B32", "Disputed"], ["#2447D6", "Deal open"], ["#7A3FD0", "Escrow funded"]];

function ParcelMap({ items, onPick }: { items: { p: any; color: string }[]; onPick: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null), map = useRef<L.Map>(), layer = useRef<L.LayerGroup>();
  useEffect(() => {
    const m = L.map(el.current!).setView([27.7, 85.3], 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(m);
    map.current = m; layer.current = L.layerGroup().addTo(m);
    return () => { m.remove(); };
  }, []);
  useEffect(() => {
    layer.current?.clearLayers();
    items.forEach(({ p, color }) => L.circleMarker([p.latE6 / 1e6, p.lngE6 / 1e6], { radius: 11, color: "#1B2B22", weight: 1.5, fillColor: color, fillOpacity: 0.85 })
      .bindTooltip(`Parcel ${p.id.toString()}`).on("click", () => onPick(p.id.toNumber())).addTo(layer.current!));
    if (items.length) map.current?.fitBounds(L.latLngBounds(items.map(({ p }) => [p.latE6 / 1e6, p.lngE6 / 1e6] as [number, number])).pad(0.4), { maxZoom: 14 });
  }, [items]);
  return <div className="map" ref={el} />;
}

export default function Registry() {
  const wallet = useAnchorWallet();
  const me = wallet?.publicKey;
  const [config, setConfig] = useState<any>(null);
  const [items, setItems] = useState<{ p: any; color: string }[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; sig?: string; err?: boolean } | null>(null);

  const load = useCallback(async () => {
    const pr: any = getProgram();
    try { setConfig(await pr.account.config.fetch(configPda())); } catch { setConfig(null); }
    try {
      const [ps, ds] = await Promise.all([pr.account.parcel.all(), pr.account.deal.all()]);
      const byKey = new Map(ds.map((d: any) => [`${d.account.parcel}:${d.account.nonce}`, d.account]));
      setItems(ps.map(({ account: p }: any) => ({ p, color: parcelColor(p, byKey.get(`${parcelPda(p.id.toNumber())}:${p.dealNonce - 1}`)) })));
    } catch { /* offline or not deployed */ }
  }, []);

  const open = useCallback(async (id: number) => {
    setSel(id); window.location.hash = `/registry/${id}`;
    try {
      const pr: any = getProgram(), pk = parcelPda(id), parcel = await pr.account.parcel.fetch(pk);
      let deal = null, dk = null;
      if (parcel.dealNonce > 0) {
        dk = dealPda(pk, parcel.dealNonce - 1); deal = await pr.account.deal.fetch(dk);
      }
      setData({ pk, parcel, deal, dk }); setMsg(null);
    } catch { setData(null); setMsg({ text: `No parcel with ID ${id} is registered.`, err: true }); }
  }, []);

  useEffect(() => { load(); const m = window.location.hash.match(/registry\/(\d+)/); if (m) open(Number(m[1])); }, [load, open]);

  const run = async (label: string, fn: (pr: any) => Promise<string>) => {
    setBusy(true); setMsg({ text: `${label}…` });
    try { const sig = await fn(getProgram(wallet)); setMsg({ text: `${label}: done.`, sig }); await load(); if (sel !== null) await open(sel); setBusy(false); return true; }
    catch (e: any) { setMsg({ text: e?.error?.errorMessage ?? e?.message ?? "Transaction failed", err: true }); }
    setBusy(false); return false;
  };

  const isReg = !!me && config?.registrar.equals(me), isLender = !!me && config?.lender.equals(me);
  const { pk, parcel, deal, dk } = data ?? {};
  const st = deal ? dealState(deal.state) : null;
  const isOwner = !!me && parcel?.owner.equals(me), isBuyer = !!me && deal?.buyer.equals(me), isSeller = !!me && deal?.seller.equals(me);
  const now = Date.now() / 1000;
  const refundable = isBuyer && (((st === "rejected" || st === "cancelled") && deal.fundedAt.toNumber() > 0) || (st === "funded" && (now >= deal.expiresAt.toNumber() || parcel.encumbrance > 0)));
  const fee = deal && config ? (BigInt(deal.price.toString()) * BigInt(config.feeBps)) / 10000n : 0n;
  const accts = { config: configPda(), parcel: pk, deal: dk };

  return (
    <div className="shell page">
      {!config && <p className="note">The program isn't set up on this cluster yet. Run the initialize step in the README.</p>}
      <main>
        <section className="col">
          <form className="search" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("id")); if (v) open(v); }}>
            <input name="id" inputMode="numeric" placeholder="Parcel ID" aria-label="Parcel ID" /><button>Look up</button>
          </form>
          {msg && <p className={msg.err ? "msg err" : "msg"}>{msg.text} {msg.sig && <a href={EXPLORER(msg.sig)} target="_blank" rel="noreferrer">View on Solana Explorer</a>}</p>}

          {parcel && (
            <article className="card">
              <h2>Parcel {parcel.id.toString()} <i className="dot" style={{ background: parcelColor(parcel, deal) }} /></h2>
              <dl>
                <dt>Owner</dt><dd>{short(parcel.owner)}{isOwner && " (you)"}</dd>
                <dt>Area</dt><dd>{parcel.areaSqm.toLocaleString()} m²</dd>
                <dt>Status</dt><dd>{parcel.encumbrance ? `${ENC[parcel.encumbrance]} lock. No sale possible.` : parcel.activeDeal ? "Sale in progress" : "Free to sell"}</dd>
                <dt>On-chain</dt><dd><a href={`https://explorer.solana.com/address/${pk}?cluster=devnet`} target="_blank" rel="noreferrer">Parcel account</a>{dk && <> · <a href={`https://explorer.solana.com/address/${dk}?cluster=devnet`} target="_blank" rel="noreferrer">Deal</a></>}</dd>
                <dt>Deed</dt><dd><a href={`https://ipfs.io/ipfs/${parcel.documentCid}`} target="_blank" rel="noreferrer">{parcel.documentCid.slice(0, 12)}…</a></dd>
              </dl>
              <label className="file">Check a document against the on-chain hash
                <input type="file" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const h = await sha256(f); setMsg(h.every((b, i) => b === parcel.documentHash[i]) ? { text: "Match. This file is the registered deed." } : { text: "No match. This file differs from the registered deed.", err: true }); }} />
              </label>
              <p className="share">Shareable link: <code>{window.location.href}</code></p>

              {deal && (
                <div className="deal">
                  <h3>Latest deal</h3>
                  <p>{STATUS[st!]}</p>
                  <dl>
                    <dt>Price</dt><dd>{usdc(deal.price)} SOL</dd>
                    <dt>Registration fee</dt><dd>{usdc(fee.toString())} SOL</dd>
                    <dt>Seller receives</dt><dd>{usdc((BigInt(deal.price.toString()) - fee).toString())} SOL</dd>
                    <dt>Buyer</dt><dd>{short(deal.buyer)}{isBuyer && " (you)"}</dd>
                  </dl>
                </div>
              )}

              <TxTable address={pk} limit={8} title="Parcel history" />

              {me && (
                <div className="actions">
                  {isOwner && !parcel.activeDeal && !parcel.encumbrance && (
                    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("Listing parcel", (pr) => pr.methods.createDeal(new PublicKey(String(f.get("buyer"))), new BN(Math.round(Number(f.get("price")) * DECIMALS))).accountsPartial({ parcel: pk, deal: dealPda(pk, parcel.dealNonce), seller: me }).rpc()); }}>
                      <h3>Sell this parcel</h3><input name="buyer" placeholder="Buyer wallet address" required /><input name="price" type="number" step="0.01" min="0.01" placeholder="Price in SOL" required /><button disabled={busy}>List for sale</button>
                    </form>)}
                  {st === "listed" && isBuyer && <button disabled={busy} onClick={() => run("Depositing into escrow", (pr) => pr.methods.fundDeal().accountsPartial({ ...accts, buyer: me }).rpc())}>Deposit {usdc(deal.price)} SOL into escrow</button>}
                  {st === "funded" && isReg && <>
                    <button disabled={busy} onClick={() => run("Approving transfer", (pr) => pr.methods.approveDeal().accountsPartial({ ...accts, seller: deal.seller, treasury: config.treasury, registrar: me }).rpc())}>Approve and settle</button>
                    <button className="ghost" disabled={busy} onClick={() => run("Rejecting deal", (pr) => pr.methods.rejectDeal().accountsPartial({ ...accts, registrar: me }).rpc())}>Reject</button></>}
                  {(st === "listed" || st === "funded") && isSeller && <button className="ghost" disabled={busy} onClick={() => run("Cancelling deal", (pr) => pr.methods.cancelDeal().accountsPartial({ parcel: pk, deal: dk, seller: me }).rpc())}>Cancel deal</button>}
                  {refundable && <button disabled={busy} onClick={() => run("Claiming refund", (pr) => pr.methods.claimRefund().accountsPartial({ ...accts, buyer: me }).rpc())}>Claim refund</button>}
                  {(isReg || isLender) && !parcel.encumbrance && (
                    <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("Placing lock", (pr) => pr.methods.placeEncumbrance(Number(f.get("kind")), String(f.get("cid"))).accountsPartial({ config: configPda(), parcel: pk, signer: me }).rpc()); }}>
                      <h3>Lock parcel</h3><select name="kind"><option value="1">Mortgage</option><option value="2">Dispute</option><option value="3">Court order</option></select><input name="cid" placeholder="Reference document CID" required /><button className="ghost" disabled={busy}>Place lock</button>
                    </form>)}
                  {parcel.encumbrance > 0 && (parcel.encBy.equals(me) || (parcel.encumbrance === 2 && isReg)) && <button className="ghost" disabled={busy} onClick={() => run("Lifting lock", (pr) => pr.methods.liftEncumbrance().accountsPartial({ config: configPda(), parcel: pk, signer: me }).rpc())}>Lift {ENC[parcel.encumbrance].toLowerCase()} lock</button>}
                </div>)}
            </article>
          )}

          {isReg && (
            <form className="card" onSubmit={async (e) => {
              e.preventDefault(); const form = e.currentTarget; const f = new FormData(form), file = f.get("deed") as File;
              const hash = file?.size ? Array.from(await sha256(file)) : new Array(32).fill(0);
              if (await run("Registering parcel", (pr) => pr.methods.registerParcel(new BN(String(f.get("id"))), new PublicKey(String(f.get("owner"))), Math.round(Number(f.get("lat")) * 1e6), Math.round(Number(f.get("lng")) * 1e6), Number(f.get("area")), String(f.get("cid")), hash).accountsPartial({ registrar: me }).rpc())) form.reset();
            }}>
              <h2>Register a parcel</h2>
              <input name="id" type="number" placeholder="Parcel ID" required /><input name="owner" placeholder="Owner wallet address" required />
              <div className="two"><input name="lat" type="number" step="any" placeholder="Latitude" required /><input name="lng" type="number" step="any" placeholder="Longitude" required /></div>
              <input name="area" type="number" placeholder="Area in m²" required /><input name="cid" placeholder="Deed IPFS CID" required />
              <label className="file">Deed file (hashed in your browser)<input name="deed" type="file" /></label><button disabled={busy}>Register parcel</button>
            </form>)}
        </section>
        <section className="col">
          <ParcelMap items={items} onPick={open} />
          <ul className="legend">{LEGEND.map(([c, t]) => <li key={t}><i className="dot" style={{ background: c }} />{t}</li>)}</ul>
        </section>
      </main>
    </div>
  );
}
