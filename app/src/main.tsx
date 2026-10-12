import React from "react";
import { createRoot } from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { RPC } from "./chain";
import App from "./App";

const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
createRoot(document.getElementById("root")!).render(
  <ConnectionProvider endpoint={RPC}><WalletProvider wallets={wallets} autoConnect><WalletModalProvider><App /></WalletModalProvider></WalletProvider></ConnectionProvider>
);
