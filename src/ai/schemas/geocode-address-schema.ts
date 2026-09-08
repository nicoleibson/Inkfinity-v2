import { z } from 'zod';

export const GeocodeAddressInputSchema = z.object({
  lat: z.number().describe("The latitude."),
  lng: z.number().describe("The longitude."),
});
export type GeocodeAddressInput = z.infer<typeof GeocodeAddressInputSchema>;

export const GeocodeAddressOutputSchema = z.object({
  address: z.string().describe("The formatted address string corresponding to the coordinates."),
});
export type GeocodeAddressOutput = z.infer<typeof GeocodeAddressOutputSchema>;
