'use server';
/**
 * @fileOverview Provides a function to reverse geocode geographic coordinates using an AI agent.
 *
 * - geocodeAddress - A function that handles the reverse geocoding process.
 * - GeocodeAddressInput - The input type for the geocodeAddress function.
 * - GeocodeAddressOutput - The return type for the geocodeAddress function.
 */

import { geocodeAddressFlow } from '@/ai/agents/geocode-address-agent';
import { type GeocodeAddressInput as GeocodeAddressInputType, type GeocodeAddressOutput as GeocodeAddressOutputType } from '@/ai/schemas/geocode-address-schema';

export type GeocodeAddressInput = GeocodeAddressInputType;
export type GeocodeAddressOutput = GeocodeAddressOutputType;


export async function geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeAddressOutput> {
  return geocodeAddressFlow(input);
}
