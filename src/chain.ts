import { createPublicClient, formatUnits, getAddress, http } from "viem";
import { celo } from "viem/chains";

/** GoodDollar contracts on Celo mainnet — see docs.gooddollar.org/for-developers/core-contracts */
const IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as const;
const UBI_SCHEME_ADDRESS = "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1" as const;
const G_DOLLAR_DECIMALS = 18;

const identityAbi = [
  {
    type: "function",
    name: "isWhitelisted",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const ubiSchemeAbi = [
  {
    type: "function",
    name: "checkEntitlement",
    stateMutability: "view",
    inputs: [{ name: "member", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "currentDay",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function client() {
  return createPublicClient({
    chain: celo,
    transport: http(process.env.CELO_RPC_URL ?? "https://forno.celo.org", {
      timeout: 30_000,
    }),
  });
}

export interface ClaimEligibilityResult {
  wallet: string;
  /** True only when the wallet is verified AND has an unclaimed entitlement today. */
  eligible: boolean;
  isWhitelisted: boolean;
  /** Whether there is an unclaimed entitlement today (independent of verification). */
  hasEntitlement: boolean;
  claimAmount: string;
  claimAmountFormatted: string;
}

/**
 * Batch-read claim eligibility for many wallets in one multicall (two reads
 * per wallet: UBIScheme.checkEntitlement + Identity.isWhitelisted). Failed
 * reads for a wallet degrade to "not eligible" rather than failing the batch.
 */
export async function getClaimEligibilityBatch(
  wallets: string[],
): Promise<ClaimEligibilityResult[]> {
  if (wallets.length === 0) return [];
  const accounts = wallets.map((w) => getAddress(w));

  const results = await client().multicall({
    contracts: accounts.flatMap((account) => [
      {
        address: UBI_SCHEME_ADDRESS,
        abi: ubiSchemeAbi,
        functionName: "checkEntitlement" as const,
        args: [account] as const,
      },
      {
        address: IDENTITY_ADDRESS,
        abi: identityAbi,
        functionName: "isWhitelisted" as const,
        args: [account] as const,
      },
    ]),
    allowFailure: true,
  });

  return accounts.map((account, i) => {
    const entitlement = results[i * 2];
    const whitelist = results[i * 2 + 1];
    const amount =
      entitlement.status === "success" ? (entitlement.result as bigint) : 0n;
    const isWhitelisted =
      whitelist.status === "success" && (whitelist.result as boolean);
    const hasEntitlement = amount > 0n;
    return {
      wallet: account,
      eligible: isWhitelisted && hasEntitlement,
      isWhitelisted,
      hasEntitlement,
      claimAmount: amount.toString(),
      claimAmountFormatted: formatUnits(amount, G_DOLLAR_DECIMALS),
    };
  });
}

/** The UBI scheme's current day counter — flips at 12:00 UTC. */
export async function getCurrentDay(): Promise<string> {
  const currentDay = await client().readContract({
    address: UBI_SCHEME_ADDRESS,
    abi: ubiSchemeAbi,
    functionName: "currentDay",
    args: [],
  });
  return currentDay.toString();
}
