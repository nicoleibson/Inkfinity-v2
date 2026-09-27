// src/ai/schemas/verify-nft-ownership-schema.ts
import { z } from 'genkit';
import { NETWORK_NAMES } from '@/lib/blockchain';

export const VerifyNftOwnershipInputSchema = z.object({
  walletAddress: z.string().describe("The wallet address of the supposed owner."),
  tokenId: z.string().describe("The ID of the NFT to verify."),
  contractAddress: z.string().describe("The NFT's smart contract address."),
  network: z.enum(NETWORK_NAMES).optional().describe("The blockchain network the token is deployed on."),
});
export type VerifyNftOwnershipInput = z.infer<typeof VerifyNftOwnershipInputSchema>;

export const VerifyNftOwnershipOutputSchema = z.object({
  isOwner: z.boolean().describe("Whether the wallet address is the true owner of the NFT."),
  reason: z.string().describe("The reason for the verification result."),
  network: z.enum(NETWORK_NAMES).optional().describe("The network the verification ran against."),
  standard: z.enum(['erc721', 'erc1155']).optional().describe("The token standard that was matched, if resolved."),
  onChainOwner: z.string().optional().describe("The owner address as read directly from the blockchain."),
});
export type VerifyNftOwnershipOutput = z.infer<typeof VerifyNftOwnershipOutputSchema>;
