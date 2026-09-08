import { z } from 'zod';

// Esquema para la entrada del flujo de mapeo
export const CodeMapInputSchema = z.object({
  rootPath: z.string().describe('The absolute root path of the project to analyze.'),
});

// Esquema para el análisis de un único archivo
export const FileAnalysisSchema = z.object({
  filePath: z.string().describe('The relative path to the file.'),
  description: z.string().describe(`A summary of the file's purpose and functionality.`),
  components: z.array(z.string()).optional().describe('List of React components defined in the file.'),
  functions: z.array(z.string()).optional().describe('List of main functions or methods defined.'),
  types: z.array(z.string()).optional().describe('List of custom types or interfaces defined.'),
  imports: z.array(z.string()).optional().describe('List of relative imports from other project files.'),
});

// Esquema para el mapa de código completo (la salida final)
export const CodeMapOutputSchema = z.array(FileAnalysisSchema);
