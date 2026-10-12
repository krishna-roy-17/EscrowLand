import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";

export const RPC: string = import.meta.env.VITE_RPC ?? "https://api.devnet.solana.com";
export const PID = new PublicKey((idl as { address: string }).address);
export const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const DECIMALS = 1_000_000_000;

const le = (n: number, bytes: number) => new BN(n).toArrayLike(Buffer, "le", bytes);
export const configPda = () => PublicKey.findProgramAddressSync([Buffer.from("config")], PID)[0];
export const parcelPda = (id: number) => PublicKey.findProgramAddressSync([Buffer.from("parcel"), le(id, 8)], PID)[0];
export const dealPda = (parcel: PublicKey, nonce: number) => PublicKey.findProgramAddressSync([Buffer.from("deal"), parcel.toBuffer(), le(nonce, 4)], PID)[0];

export const connection = new Connection(RPC, "confirmed");
const readOnly = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t };
/** Program client. Pass the wallet-adapter wallet to sign; omit for read-only (no wallet needed to verify). */
export function getProgram(wallet?: any): Program<Idl> {
  return new Program(idl as Idl, new AnchorProvider(connection, wallet ?? readOnly, { commitment: "confirmed" }));
}

export const sha256 = async (f: File) => new Uint8Array(await crypto.subtle.digest("SHA-256", await f.arrayBuffer()));
export const dealState = (s: any) => Object.keys(s)[0] as "listed" | "funded" | "completed" | "cancelled" | "rejected" | "expired" | "refunded";
export const ENC = ["", "Mortgage", "Dispute", "Court order"];

/** SRS 3.7 colours: green free, amber mortgaged, red disputed, blue deal in progress, purple escrow funded. */
export function parcelColor(p: any, d?: any) {
  if (p.encumbrance === 1) return "#C98A00";
  if (p.encumbrance > 1) return "#C23B32";
  if (p.activeDeal && d) return dealState(d.state) === "funded" ? "#7A3FD0" : "#2447D6";
  return "#2E8B57";
}
export { BN };
