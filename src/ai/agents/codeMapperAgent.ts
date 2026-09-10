import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FileAnalysisSchema } from '../schemas/codeMapperSchema';

const AgentInputSchema = z.object({
  filePath: z.string(),
  fileContent: z.string(),
});
export type AgentInput = z.infer<typeof AgentInputSchema>;

const codeMapperPrompt = ai.definePrompt(
  {
    name: 'codeMapperPrompt',
    model: 'googleai/gemini-3.5-flash-lite',
    input: { schema: AgentInputSchema },
    output: { schema: FileAnalysisSchema, format: 'json' },
    prompt: `You are an expert software engineer tasked with analyzing a source code file.
      Your goal is to create a JSON summary of the file.

      Analyze the following file:
      File Path: {{{filePath}}}
      Content:
      {{{fileContent}}}

      Based on the content, provide the following information in a valid JSON format:
      1.  **filePath**: The relative path of the file.
      2.  **description**: A concise, one-sentence summary of the file's main purpose.
      3.  **components**: An array of exported React component names defined in this file. If none, provide an empty array.
      4.  **functions**: An array of exported function/method names (excluding components). If none, provide an empty array.
      5.  **types**: An array of exported type or interface names. If none, provide an empty array.
      6.  **imports**: An array of relative import paths (those starting with './', '../', or '@/'). Exclude library imports like 'react' or 'zod'.

      Your response MUST be a single JSON object. Do not include any text or explanations outside of the JSON object.
    `,
  }
);


export const codeMapperAgentFlow = ai.defineFlow(
  {
    name: 'codeMapperAgentFlow',
    inputSchema: AgentInputSchema,
    outputSchema: FileAnalysisSchema,
  },
  async (input) => {
    try {
      const { output } = await codeMapperPrompt(input);
      if (output) {
        return output;
      }
      throw new Error("No output from LLM.");
    } catch (e: any) {
      console.error(`Error analyzing file ${input.filePath}:`, e);
      return {
        filePath: input.filePath,
        description: 'Error: Failed to parse analysis from the language model.',
        components: [],
        functions: [],
        types: [],
        imports: [],
      };
    }
  }
);
