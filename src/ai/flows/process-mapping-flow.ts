'use server';

import { ai } from '@/ai/genkit';
import { 
  ProcessMappingInputSchema,
  ProcessMappingOutputSchema,
} from '../schemas/process-mapping-schema';
import { processMappingAgentFlow } from '../agents/process-mapping-agent';

export const processMappingFlow = ai.defineFlow(
  {
    name: 'processMappingFlow',
    inputSchema: ProcessMappingInputSchema,
    outputSchema: ProcessMappingOutputSchema,
  },
  async (input) => {
    return processMappingAgentFlow(input);
  }
);
