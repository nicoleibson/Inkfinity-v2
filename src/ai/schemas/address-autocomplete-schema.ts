import { z } from 'zod';

export const AutocompleteAddressInputSchema = z.object({
  query: z.string().describe("The partial address string to autocomplete."),
});
export type AutocompleteAddressInput = z.infer<typeof AutocompleteAddressInputSchema>;

export const AutocompleteAddressSuggestionSchema = z.object({
    address: z.string().describe('The full, formatted address suggestion.'),
    coordinates: z.object({
      lat: z.number().describe('The latitude of the address.'),
      lng: z.number().describe('The longitude of the address.'),
    }),
});
export type AutocompleteAddressSuggestion = z.infer<typeof AutocompleteAddressSuggestionSchema>;

export const AutocompleteAddressOutputSchema = z.object({
    suggestions: z.array(AutocompleteAddressSuggestionSchema),
});
export type AutocompleteAddressOutput = z.infer<typeof AutocompleteAddressOutputSchema>;
