import BN from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../src/idl.json";

// One-time setup. Env: REGISTRAR (required), LENDER (optional, defaults to registrar),
// TREASURY (optional, defaults to the deployer wallet; it receives the 1% fee).
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = new anchor.Program(idl as anchor.Idl, provider);
const admin = provider.wallet.publicKey;
const registrar = new PublicKey(process.env.REGISTRAR!);
const lender = new PublicKey(process.env.LENDER ?? process.env.REGISTRAR!);
const treasury = new PublicKey(process.env.TREASURY ?? admin.toString());

const sig = await (program.methods as any)
  .initialize(registrar, lender, treasury, 100, new BN(604800)) // 1% fee, 7-day refund timeout
  .accountsPartial({ admin })
  .rpc();
console.log("initialized:", sig);
