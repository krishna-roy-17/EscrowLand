//! EscrowLand (SRS v2.0): land registry + non-custodial stablecoin escrow.
//! Escrowed SOL sits in the Deal PDA account itself: only this program can move it.
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("BQtsc5bnJZ4ymM8CUnsSi8gR6f7NcZddTLTzWegfzLmB");

#[program]
pub mod escrowland {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, registrar: Pubkey, lender: Pubkey, treasury: Pubkey, fee_bps: u16, timeout_sec: i64) -> Result<()> {
        require!(fee_bps <= 10_000, E::BadFee);
        *ctx.accounts.config = Config { admin: ctx.accounts.admin.key(), registrar, lender, treasury, fee_bps, timeout_sec, bump: ctx.bumps.config };
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, registrar: Pubkey, lender: Pubkey, treasury: Pubkey, fee_bps: u16, timeout_sec: i64) -> Result<()> {
        require!(fee_bps <= 10_000, E::BadFee);
        let c = &mut ctx.accounts.config;
        c.registrar = registrar; c.lender = lender; c.treasury = treasury; c.fee_bps = fee_bps; c.timeout_sec = timeout_sec;
        Ok(())
    }

    /// FR-2: duplicate IDs fail because the parcel PDA already exists.
    pub fn register_parcel(ctx: Context<RegisterParcel>, id: u64, owner: Pubkey, lat_e6: i32, lng_e6: i32, area_sqm: u32, document_cid: String, document_hash: [u8; 32]) -> Result<()> {
        *ctx.accounts.parcel = Parcel { id, owner, lat_e6, lng_e6, area_sqm, document_cid, document_hash, encumbrance: 0, enc_by: Pubkey::default(), enc_cid: String::new(), active_deal: false, deal_nonce: 0, registered_at: Clock::get()?.unix_timestamp, bump: ctx.bumps.parcel };
        emit!(ParcelRegistered { id, owner });
        Ok(())
    }

    /// FR-3.1/3.2/3.5/3.6: one named buyer, fixed price, one active deal per parcel.
    pub fn create_deal(ctx: Context<CreateDeal>, buyer: Pubkey, price: u64) -> Result<()> {
        require!(price > 0, E::BadAmount);
        let p = &mut ctx.accounts.parcel;
        require!(!p.active_deal, E::ActiveDeal);
        require!(p.encumbrance == 0, E::Encumbered);
        *ctx.accounts.deal = Deal { parcel: p.key(), nonce: p.deal_nonce, seller: ctx.accounts.seller.key(), buyer, price, fee: 0, created_at: Clock::get()?.unix_timestamp, funded_at: 0, expires_at: 0, state: DealState::Listed, bump: ctx.bumps.deal };
        p.active_deal = true;
        p.deal_nonce += 1;
        emit!(DealListed { parcel_id: p.id, buyer, price });
        Ok(())
    }

    /// FR-3.3/3.4: only the named buyer, exactly the price, paid in SOL into the Deal PDA.
    pub fn fund_deal(ctx: Context<FundDeal>) -> Result<()> {
        require!(ctx.accounts.parcel.encumbrance == 0, E::Encumbered);
        let (price, now, timeout) = (ctx.accounts.deal.price, Clock::get()?.unix_timestamp, ctx.accounts.config.timeout_sec);
        system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer { from: ctx.accounts.buyer.to_account_info(), to: ctx.accounts.deal.to_account_info() }), price)?;
        let d = &mut ctx.accounts.deal;
        d.state = DealState::Funded; d.funded_at = now; d.expires_at = now + timeout;
        emit!(DealFunded { parcel_id: ctx.accounts.parcel.id, amount: price });
        Ok(())
    }

    /// FR-3.8/3.9: atomic delivery-versus-payment.
    pub fn approve_deal(ctx: Context<ApproveDeal>) -> Result<()> {
        let (price, seller, buyer) = (ctx.accounts.deal.price, ctx.accounts.deal.seller, ctx.accounts.deal.buyer);
        require!(ctx.accounts.parcel.owner == seller, E::NotOwner);
        require!(ctx.accounts.parcel.encumbrance == 0, E::Encumbered);
        let fee = (price as u128 * ctx.accounts.config.fee_bps as u128 / 10_000) as u64; // rounds down: favours seller
        ctx.accounts.parcel.owner = buyer;
        ctx.accounts.parcel.active_deal = false;
        ctx.accounts.deal.state = DealState::Completed;
        ctx.accounts.deal.fee = fee;
        let from = ctx.accounts.deal.to_account_info();
        pay(&from, &ctx.accounts.seller.to_account_info(), price - fee)?;
        if fee > 0 { pay(&from, &ctx.accounts.treasury.to_account_info(), fee)?; }
        emit!(DealCompleted { parcel_id: ctx.accounts.parcel.id, seller, buyer, price, fee });
        Ok(())
    }

    /// FR-3.10: parcel is freed; buyer pulls the refund with `claim_refund`.
    pub fn reject_deal(ctx: Context<RegistrarDeal>) -> Result<()> {
        require!(ctx.accounts.deal.state == DealState::Funded, E::BadState);
        ctx.accounts.deal.state = DealState::Rejected;
        ctx.accounts.parcel.active_deal = false;
        emit!(DealRejected { parcel_id: ctx.accounts.parcel.id });
        Ok(())
    }

    /// FR-3.11
    pub fn cancel_deal(ctx: Context<CancelDeal>) -> Result<()> {
        require!(matches!(ctx.accounts.deal.state, DealState::Listed | DealState::Funded), E::BadState);
        ctx.accounts.deal.state = DealState::Cancelled;
        ctx.accounts.parcel.active_deal = false;
        emit!(DealCancelled { parcel_id: ctx.accounts.parcel.id });
        Ok(())
    }

    /// FR-3.12/3.13/3.14: after reject/cancel, after timeout, or when encumbered.
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let (state, expires, funded_at, price) = (ctx.accounts.deal.state, ctx.accounts.deal.expires_at, ctx.accounts.deal.funded_at, ctx.accounts.deal.price);
        let ok = match state {
            DealState::Rejected | DealState::Cancelled => funded_at > 0,
            DealState::Funded => now >= expires || ctx.accounts.parcel.encumbrance != 0,
            _ => false,
        };
        require!(ok, E::NotRefundable);
        ctx.accounts.deal.state = if state == DealState::Funded { DealState::Expired } else { DealState::Refunded };
        if state == DealState::Funded { ctx.accounts.parcel.active_deal = false; }
        pay(&ctx.accounts.deal.to_account_info(), &ctx.accounts.buyer.to_account_info(), price)?;
        emit!(RefundClaimed { parcel_id: ctx.accounts.parcel.id, buyer: ctx.accounts.buyer.key(), amount: price });
        Ok(())
    }

    /// FR-5.1: kind 1 mortgage, 2 dispute, 3 court order.
    pub fn place_encumbrance(ctx: Context<Encumber>, kind: u8, reference_cid: String) -> Result<()> {
        require!((1..=3).contains(&kind), E::BadKind);
        let (s, c) = (ctx.accounts.signer.key(), &ctx.accounts.config);
        require!(s == c.registrar || s == c.lender, E::Unauthorized);
        let p = &mut ctx.accounts.parcel;
        require!(p.encumbrance == 0, E::Encumbered);
        p.encumbrance = kind; p.enc_by = s; p.enc_cid = reference_cid;
        emit!(EncumbrancePlaced { parcel_id: p.id, kind });
        Ok(())
    }

    /// FR-5.3: placer, or the registrar for disputes.
    pub fn lift_encumbrance(ctx: Context<Encumber>) -> Result<()> {
        let (s, reg) = (ctx.accounts.signer.key(), ctx.accounts.config.registrar);
        let p = &mut ctx.accounts.parcel;
        require!(p.encumbrance != 0, E::BadState);
        require!(s == p.enc_by || (p.encumbrance == 2 && s == reg), E::Unauthorized);
        p.encumbrance = 0; p.enc_by = Pubkey::default(); p.enc_cid = String::new();
        emit!(EncumbranceLifted { parcel_id: p.id });
        Ok(())
    }
}

/// Moves lamports out of a program-owned account (the Deal PDA) without a CPI.
fn pay<'info>(from: &AccountInfo<'info>, to: &AccountInfo<'info>, amt: u64) -> Result<()> {
    let (f, t) = (from.lamports().checked_sub(amt).ok_or(E::BadAmount)?, to.lamports().checked_add(amt).ok_or(E::BadAmount)?);
    **from.try_borrow_mut_lamports()? = f;
    **to.try_borrow_mut_lamports()? = t;
    Ok(())
}

#[account] #[derive(InitSpace)]
pub struct Config { pub admin: Pubkey, pub registrar: Pubkey, pub lender: Pubkey, pub treasury: Pubkey, pub fee_bps: u16, pub timeout_sec: i64, pub bump: u8 }

#[account] #[derive(InitSpace)]
pub struct Parcel {
    pub id: u64, pub owner: Pubkey, pub lat_e6: i32, pub lng_e6: i32, pub area_sqm: u32,
    #[max_len(64)] pub document_cid: String, pub document_hash: [u8; 32],
    pub encumbrance: u8, pub enc_by: Pubkey, #[max_len(64)] pub enc_cid: String,
    pub active_deal: bool, pub deal_nonce: u32, pub registered_at: i64, pub bump: u8,
}

#[account] #[derive(InitSpace)]
pub struct Deal { pub parcel: Pubkey, pub nonce: u32, pub seller: Pubkey, pub buyer: Pubkey, pub price: u64, pub fee: u64, pub created_at: i64, pub funded_at: i64, pub expires_at: i64, pub state: DealState, pub bump: u8 }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DealState { Listed, Funded, Completed, Cancelled, Rejected, Expired, Refunded }

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)] pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ E::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}
#[derive(Accounts)]
#[instruction(id: u64)]
pub struct RegisterParcel<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = registrar @ E::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(init, payer = registrar, space = 8 + Parcel::INIT_SPACE, seeds = [b"parcel", id.to_le_bytes().as_ref()], bump)]
    pub parcel: Account<'info, Parcel>,
    #[account(mut)] pub registrar: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct CreateDeal<'info> {
    #[account(mut, seeds = [b"parcel", parcel.id.to_le_bytes().as_ref()], bump = parcel.bump, constraint = parcel.owner == seller.key() @ E::NotOwner)]
    pub parcel: Account<'info, Parcel>,
    #[account(init, payer = seller, space = 8 + Deal::INIT_SPACE, seeds = [b"deal", parcel.key().as_ref(), parcel.deal_nonce.to_le_bytes().as_ref()], bump)]
    pub deal: Account<'info, Deal>,
    #[account(mut)] pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct FundDeal<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(constraint = deal.parcel == parcel.key())]
    pub parcel: Account<'info, Parcel>,
    #[account(mut, constraint = deal.buyer == buyer.key() @ E::NotBuyer, constraint = deal.state == DealState::Listed @ E::BadState)]
    pub deal: Account<'info, Deal>,
    #[account(mut)] pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ApproveDeal<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = registrar @ E::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = deal.parcel == parcel.key())]
    pub parcel: Account<'info, Parcel>,
    #[account(mut, constraint = deal.state == DealState::Funded @ E::BadState)]
    pub deal: Account<'info, Deal>,
    #[account(mut, address = deal.seller)]
    pub seller: SystemAccount<'info>,
    #[account(mut, address = config.treasury)]
    pub treasury: SystemAccount<'info>,
    pub registrar: Signer<'info>,
}
#[derive(Accounts)]
pub struct RegistrarDeal<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = registrar @ E::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = deal.parcel == parcel.key())]
    pub parcel: Account<'info, Parcel>,
    #[account(mut)] pub deal: Account<'info, Deal>,
    pub registrar: Signer<'info>,
}
#[derive(Accounts)]
pub struct CancelDeal<'info> {
    #[account(mut, constraint = deal.parcel == parcel.key())]
    pub parcel: Account<'info, Parcel>,
    #[account(mut, constraint = deal.seller == seller.key() @ E::NotOwner)]
    pub deal: Account<'info, Deal>,
    pub seller: Signer<'info>,
}
#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = deal.parcel == parcel.key())]
    pub parcel: Account<'info, Parcel>,
    #[account(mut, constraint = deal.buyer == buyer.key() @ E::NotBuyer)]
    pub deal: Account<'info, Deal>,
    #[account(mut)] pub buyer: Signer<'info>,
}
#[derive(Accounts)]
pub struct Encumber<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)] pub parcel: Account<'info, Parcel>,
    pub signer: Signer<'info>,
}

#[event] pub struct ParcelRegistered { pub id: u64, pub owner: Pubkey }
#[event] pub struct DealListed { pub parcel_id: u64, pub buyer: Pubkey, pub price: u64 }
#[event] pub struct DealFunded { pub parcel_id: u64, pub amount: u64 }
#[event] pub struct DealCompleted { pub parcel_id: u64, pub seller: Pubkey, pub buyer: Pubkey, pub price: u64, pub fee: u64 }
#[event] pub struct DealRejected { pub parcel_id: u64 }
#[event] pub struct DealCancelled { pub parcel_id: u64 }
#[event] pub struct RefundClaimed { pub parcel_id: u64, pub buyer: Pubkey, pub amount: u64 }
#[event] pub struct EncumbrancePlaced { pub parcel_id: u64, pub kind: u8 }
#[event] pub struct EncumbranceLifted { pub parcel_id: u64 }

#[error_code]
pub enum E {
    #[msg("Signer is not authorized for this action")] Unauthorized,
    #[msg("Only the parcel owner can do this")] NotOwner,
    #[msg("Only the named buyer can do this")] NotBuyer,
    #[msg("Parcel already has an active deal")] ActiveDeal,
    #[msg("Parcel is encumbered")] Encumbered,
    #[msg("Deal is not in the right state")] BadState,
    #[msg("Funds are not refundable yet")] NotRefundable,
    #[msg("Amount must be greater than zero")] BadAmount,
    #[msg("Fee must be 10000 bps or less")] BadFee,
    #[msg("Encumbrance kind must be 1, 2 or 3")] BadKind,
}
