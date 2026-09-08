// src/ai/genkit.ts
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [
    googleAI({
      // Intenta leer la clave API de múltiples fuentes para máxima compatibilidad
      // 1. GEMINI_API_KEY (estándar y definido en apphosting.yaml)
      // 2. GOOGLE_GENAI_API_KEY (estándar de Genkit)
      // 3. GOOGLE_API_KEY (estándar de Google)
      // 4. NEXT_PUBLIC_... (las que el usuario tiene en su .env)
      apiKey: 
        process.env.GEMINI_API_KEY || 
        process.env.GOOGLE_GENAI_API_KEY || 
        process.env.GOOGLE_API_KEY || 
        process.env.NEXT_PUBLIC_GEMINI_API_KEY || 
        process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    }),
  ],
});