import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "El BOT_TOKEN es requerido en el archivo .env"),
  OPENAI_API_KEY: z.string().min(1, "Falta la llave de OpenAI en .env"),
  GEMINI_API_KEY: z.string().min(1, "Falta la llave de Gemini en .env"),
});

export const env = envSchema.parse(process.env);
