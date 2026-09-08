// src/ai/schemas/verify-nft-ownership-schema.ts
import { z } from 'genkit';

export const VerifyNftOwnershipInputSchema = z.object({
  walletAddress: z.string().describe("The wallet address of the supposed owner."),
  tokenId: z.string().describe("The ID of the NFT to verify."),
  contractAddress: z.string().describe("The NFT's smart contract address."),
});
export type VerifyNftOwnershipInput = z.infer<typeof VerifyNftOwnershipInputSchema>;

export const VerifyNftOwnershipOutputSchema = z.object({
  isOwner: z.boolean().describe("Whether the wallet address is the true owner of the NFT."),
  reason: z.string().describe("The reason for the verification result."),
});
export type VerifyNftOwnershipOutput = z.infer<typeof VerifyNftOwnershipOutputSchema>;
