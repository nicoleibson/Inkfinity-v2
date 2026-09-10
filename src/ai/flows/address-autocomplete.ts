'use server';
/**
 * @fileOverview Provides a function to autocomplete addresses using an AI agent.
 */

import { autocompleteAddressAgentFlow } from '@/ai/agents/address-autocomplete-agent';
import type { AutocompleteAddressInput, AutocompleteAddressOutput } from '@/ai/schemas/address-autocomplete-schema';

export async function autocompleteAddress(
  input: AutocompleteAddressInput
): Promise<AutocompleteAddressOutput> {
  return autocompleteAddressAgentFlow(input);
}
