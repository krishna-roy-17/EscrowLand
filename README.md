# EscrowLand (study project)

Land registry + escrow on Solana. Rust/Anchor program (`programs/escrowland`) and a React + TypeScript web app (`app`).
Buyers pay in **SOL straight from their Phantom wallet**; the SOL is held by the program (inside the Deal account) until the registrar approves.
Run it on **Devnet**: Devnet SOL is free and has no value. Not legal advice, not a legal registry. See the "Nepal & law" page in the app.

## Roles (use 3 or 4 Phantom accounts)
Registrar (A) registers parcels and approves sales · Seller (B) owns a parcel · Buyer (C) pays · Lender (optional) places mortgage locks.

## Windows: use WSL2
```powershell
wsl --install -d Ubuntu      # in PowerShell as Administrator, then restart
```
Everything below runs in the **Ubuntu** terminal.

## 1. Install tools (once)
```bash
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev libudev-dev curl unzip git
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh && source ~/.cargo/env
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install 0.31.1 && avm use 0.31.1
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && source ~/.bashrc && nvm install 22
```

## 2. Unzip and prepare Devnet
```bash
cd ~ && unzip /mnt/d/escrowland-app.zip -d escrowland-app && cd escrowland-app   # adjust the zip path
solana config set --url devnet --keypair ~/.config/solana/id.json
solana-keygen new          # only if ~/.config/solana/id.json does not exist. Never use --force on a wallet you care about.
solana airdrop 2           # or https://faucet.solana.com; deploying needs about 3 SOL
```

## 3. Build and deploy the program
```bash
rm -f target/deploy/escrowland-keypair.json     # only if you deployed an older version before
anchor build && anchor keys sync && anchor build
anchor deploy
cp target/idl/escrowland.json app/src/idl.json  # REQUIRED: the app reads the program ID from this file
```
If the build says `lock file version 4`, delete `Cargo.lock` and rebuild.

## 4. Initialize once
```bash
cd app && npm install
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=$HOME/.config/solana/id.json \
REGISTRAR=<PHANTOM_ACCOUNT_A_ADDRESS> npm run init
```
Prints `initialized: <signature>`. The fee (1%) goes to your CLI wallet unless you set `TREASURY=<address>`.

## 5. Fund the Phantom accounts
In Phantom: Settings, Developer Settings, Testnet Mode, Solana Devnet. Get Devnet SOL for accounts A, B and C from https://faucet.solana.com
(buyer C needs more than the price, e.g. 2 SOL for a 1 SOL sale; others need about 0.1 SOL for fees and rent).

## 6. Run the website
```bash
cd ~/escrowland-app/app && npm run dev     # open http://localhost:5173 in Chrome or Edge
```
Optional: `cp .env.example .env` and set `VITE_CONTACT_EMAIL` for the Contact page.

## 7. Try a sale
1. **A (registrar):** Registry, "Register a parcel": ID `1`, owner = B's address, lat `27.7172`, lng `85.3240`, area `500`, CID `bafy-demo`.
2. **B (seller):** look up `1`, "Sell this parcel": buyer = C's address, price `1` SOL.
3. **C (buyer):** look up `1`, "Deposit 1 SOL into escrow".
4. **A:** look up `1`, "Approve and settle". Owner becomes C; B receives 0.99 SOL; the treasury receives 0.01 SOL.
Try "Reject" instead of step 4, then claim the refund as C. Use the **Explorer** page to see every transaction.

## How it works
- Escrowed SOL sits in the Deal PDA (`["deal", parcel, nonce]`), which only the program can debit.
- `approve_deal` pays the seller, pays the fee (rounded down), and changes the parcel owner in one transaction.
- Refunds are pull-based (`claim_refund`): after reject or cancel, after the 7-day timeout, or if a lock appears.
- Encumbrance locks (mortgage, dispute, court order) block listing, funding and approval.
- Parcels store lat/lng directly; history comes from transaction logs (see Explorer).

## Troubleshooting
- Page won't load in VS Code preview: use Chrome or Edge on Windows.
- "The program isn't set up on this cluster": step 3's `cp` or step 4 was skipped.
- Phantom shows nothing: it is on Mainnet; switch it to Devnet.
- Keep this on Devnet. The contract is unaudited, and Nepal Rastra Bank prohibits cryptocurrency use, so do not use real funds.
