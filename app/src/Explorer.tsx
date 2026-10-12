import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { configPda, connection, EXPLORER, PID } from "./chain";
import idl from "./idl.json";

const addrUrl = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const pascal = (s: string) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
const IX = new Set((idl as any).instructions.map((i: any) => pascal(i.name)));
const spaced = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2");
export const ago = (t?: number | null) => { if (!t) return "pending"; const s = Math.max(0, Date.now() / 1000 - t); return s < 60 ? `${Math.floor(s)}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
const ixName = (logs?: string[] | null) => { for (const l of logs ?? []) { const m = l.match(/Instruction: (\w+)/); if (m && IX.has(m[1])) return spaced(m[1]); } return "Other"; };
const Copy = ({ v }: { v: string }) => <button className="copy" onClick={() => navigator.clipboard?.writeText(v)} aria-label="Copy">Copy</button>;

/** Recent transactions touching an address, with the program instruction decoded from the logs. */
export function TxTable({ address, limit = 12, title }: { address: PublicKey; limit?: number; title: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(async () => {
    try {
      const sigs = await connection.getSignaturesForAddress(address, { limit });
      const txs = await connection.getParsedTransactions(sigs.map((s) => s.signature), { maxSupportedTransactionVersion: 0 });
      setRows(sigs.map((s, i) => ({ ...s, name: ixName(txs[i]?.meta?.logMessages) })));
    } catch { setRows([]); }
  }, [address, limit]);
  useEffect(() => { setRows(null); load(); }, [load]);
  return (
    <div className="txbox">
      <div className="txhead"><h3>{title}</h3><button className="ghost sm" onClick={load}>Refresh</button></div>
      {rows === null ? <p className="mute">Loading…</p> : rows.length === 0 ? <p className="mute">No transactions yet.</p> : (
        <div className="scroll"><table><thead><tr><th>Action</th><th>Result</th><th>When</th><th>Signature</th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.signature}><td>{r.name}</td><td><span className={r.err ? "pill bad" : "pill ok"}>{r.err ? "Failed" : "Success"}</span></td><td>{ago(r.blockTime)}</td>
            <td><a href={EXPLORER(r.signature)} target="_blank" rel="noreferrer">{r.signature.slice(0, 8)}…</a></td></tr>))}
        </tbody></table></div>)}
    </div>);
}

export default function Explorer() {
  const [net, setNet] = useState<any>(null);
  const [q, setQ] = useState(""), [tx, setTx] = useState<any>(null), [err, setErr] = useState("");
  useEffect(() => {
    const go = async () => {
      try {
        const [e, p] = await Promise.all([connection.getEpochInfo(), connection.getRecentPerformanceSamples(1)]);
        setNet({ slot: e.absoluteSlot, epoch: e.epoch, height: e.blockHeight, tps: p[0] ? Math.round(p[0].numTransactions / p[0].samplePeriodSecs) : 0 });
      } catch { setNet(null); }
    };
    go(); const t = setInterval(go, 10000); return () => clearInterval(t);
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setTx(null); const v = q.trim(); if (!v) return;
    if (/^\d+$/.test(v)) { window.location.hash = `/registry/${v}`; return; }
    if (v.length > 60) {
      try {
        const t = await connection.getParsedTransaction(v, { maxSupportedTransactionVersion: 0 });
        if (!t) return setErr("Transaction not found on Devnet yet. If it was just sent, wait a few seconds.");
        setTx({ sig: v, t });
      } catch { setErr("That doesn't look like a valid signature."); }
      return;
    }
    try { new PublicKey(v); window.open(addrUrl(v), "_blank"); } catch { setErr("Enter a parcel ID, a wallet/account address, or a transaction signature."); }
  };

  const stats: [string, any][] = net ? [["Slot", net.slot.toLocaleString()], ["Block height", net.height?.toLocaleString() ?? "n/a"], ["Epoch", net.epoch], ["Transactions per second", net.tps.toLocaleString()]] : [];
  return (
    <div className="shell page">
      <h1 className="ptitle">Ledger explorer</h1>
      <p className="lead">Every parcel registration, deposit and transfer is a public Solana Devnet transaction. Look anything up here.</p>
      <div className="statrow">{net ? stats.map(([k, v]) => <div className="stat" key={k}><b>{v}</b><span>{k}</span></div>) : <p className="mute">Connecting to Devnet…</p>}</div>
      <form className="search wide" onSubmit={search}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Parcel ID, wallet address, or transaction signature" aria-label="Search" /><button>Search</button></form>
      {err && <p className="msg err">{err}</p>}
      {tx && (
        <article className="card reveal in">
          <h2>Transaction</h2>
          <dl>
            <dt>Result</dt><dd><span className={tx.t.meta?.err ? "pill bad" : "pill ok"}>{tx.t.meta?.err ? "Failed" : "Success"}</span></dd>
            <dt>Action</dt><dd>{ixName(tx.t.meta?.logMessages)}</dd><dt>Slot</dt><dd>{tx.t.slot.toLocaleString()}</dd><dt>Time</dt><dd>{tx.t.blockTime ? new Date(tx.t.blockTime * 1000).toLocaleString() : "n/a"}</dd>
            <dt>Fee</dt><dd>{(tx.t.meta?.fee ?? 0) / 1e9} SOL</dd><dt>Signer</dt><dd>{tx.t.transaction.message.accountKeys[0].pubkey.toString().slice(0, 8)}…</dd>
          </dl>
          <details><summary>Program logs</summary><pre>{(tx.t.meta?.logMessages ?? []).join("\n")}</pre></details>
          <a href={EXPLORER(tx.sig)} target="_blank" rel="noreferrer">Open in Solana Explorer</a>
        </article>)}
      <div className="card"><h2>Program</h2>
        <dl><dt>Program ID</dt><dd><a href={addrUrl(PID.toString())} target="_blank" rel="noreferrer">{PID.toString().slice(0, 10)}…</a> <Copy v={PID.toString()} /></dd>
          <dt>Config account</dt><dd><a href={addrUrl(configPda().toString())} target="_blank" rel="noreferrer">{configPda().toString().slice(0, 10)}…</a> <Copy v={configPda().toString()} /></dd><dt>Cluster</dt><dd>Solana Devnet (test network)</dd></dl></div>
      <TxTable address={PID} limit={15} title="Recent registry activity" />
    </div>);
}
