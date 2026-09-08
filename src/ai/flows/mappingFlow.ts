'use server';

import { ai } from '@/ai/genkit';
import { promises as fs } from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { codeMapperAgentFlow } from '../agents/codeMapperAgent';
import { CodeMapInputSchema, FileAnalysisSchema } from '../schemas/codeMapperSchema';
import { z } from 'zod';

export const mappingFlow = ai.defineFlow(
  {
    name: 'mapCodebaseFlow', // The name in INSTRUCCIONES_AGENTE_MAPEO.txt
    inputSchema: CodeMapInputSchema,
    outputSchema: z.string(), // Returns a confirmation message
  },
  async (input) => {
    const projectRoot = input.rootPath;
    const srcPath = path.join(projectRoot, 'src');

    // Find all .ts and .tsx files within the src directory
    const files = await glob('**/*.{ts,tsx}', {
      cwd: srcPath,
      ignore: [
        '**/*.test.ts', // Ignore test files
        '**/*.spec.ts', // Ignore spec files
        '**/node_modules/**',
        '**/schemas/**', // Ignore schema files for this analysis
      ],
      absolute: true, // Get absolute paths
    });

    console.log(`Found ${files.length} files to analyze.`);

    const allAnalyses: z.infer<typeof FileAnalysisSchema>[] = [];

    // Analyze each file sequentially to avoid overwhelming the API
    for (const filePath of files) {
       try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(projectRoot, filePath);
        
        console.log(`Analyzing: ${relativePath}`);
        
        const analysis = await codeMapperAgentFlow({ 
          filePath: relativePath,
          fileContent: fileContent,
        });

        if (analysis) {
            allAnalyses.push(analysis);
        }

      } catch (error) {
        console.error(`Error analyzing file ${filePath}:`, error);
      }
    }

    const results = allAnalyses.filter(Boolean); // Filter out null results

    // Define the output path for the code map
    const outputPath = path.join(projectRoot, 'src', 'ai', 'code_map.json');

    // Write the results to the JSON file
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

    const confirmationMessage = `Successfully generated code map with ${results.length} files at ${outputPath}`;
    console.log(confirmationMessage);
    return confirmationMessage;
  }
);
