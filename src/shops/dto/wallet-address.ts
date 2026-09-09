/**
 * The payout addresses a shop can be given.
 *
 * EVM only, and deliberately narrower than "some string a chain might accept":
 * the shop's backend verifies payments against an EIP-155 chain and compares
 * `transaction.to` with this value, so an address from any other chain would be
 * taken happily here and then reject every payment the customer makes. Better
 * to refuse it on the form the owner is still looking at.
 *
 * Case is left free rather than lowercased: EIP-55 checksum casing is what
 * wallets show and what owners paste, and the comparison on the shop's side is
 * case-insensitive anyway.
 */
export const WALLET_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export const WALLET_ADDRESS_MESSAGE =
  'walletAddress must be a wallet address: 0x followed by 40 hexadecimal characters';
