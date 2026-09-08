'use server';

import { ai } from '@/ai/genkit';
import { 
  ProcessMappingInputSchema,
  ProcessMappingOutputSchema,
} from '../schemas/process-mapping-schema';

const processMappingPrompt = ai.definePrompt({
    name: 'processMappingPrompt',
    model: 'googleai/gemini-3.5-flash-lite',
    input: { schema: ProcessMappingInputSchema },
    output: { schema: ProcessMappingOutputSchema },
    prompt: `You are an expert in business process mapping. Your task is to convert a natural language description of a business process into a structured JSON object.

    Process Description:
    {{{processDescription}}}
    `,
});

export const processMappingAgentFlow = ai.defineFlow(
  {
    name: 'processMappingAgentFlow',
    inputSchema: ProcessMappingInputSchema,
    outputSchema: ProcessMappingOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await processMappingPrompt(input);
      if (output) {
        return output;
      }
      throw new Error("No output from LLM.");
    } catch (e) {
      console.error("Error parsing LLM output:", e);
      return {
        processName: "Error",
        activities: [],
        decisions: [],
        endEvents: ["Failed to parse the process map from the language model's response."],
        flow: [],
      };
    }
  }
);
