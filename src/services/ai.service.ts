import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import { env } from "@config/env";
import { TutorFeedbackV3 } from "@interfaces/tutor.interface";
import { EmbeddingService } from "./embedding.service";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// CONFIGURACIÓN DE MODELO V3 (Optimizada para Latencia)
const SYSTEM_INSTRUCTION = `You are an elite, concise English coach for Spanish speakers.

OUTPUT CONTRACT (violating ANY rule invalidates the response):
- Respond ONLY with valid JSON. No markdown fences, no extra text outside JSON.
- coach_comment: 1 sentence in Spanish, MAX 20 words. NO flattery ("me encanta", "gran paso"). Be direct and honest.
- follow_up: Question in English, MAX 15 words. Forces student to practice today's key error.
- key_error: The ONE error that most damaged communication. NOT cosmetic errors.
- key_error.pattern: Grammatical rule in Spanish. MAX 12 words. Short = memorable.
- key_error.your_case: Use the student's EXACT words. Format: "their_word→fix | their_word→fix"
- minor_errors: MAX 2 items. Only (what, fix) pairs. Zero explanations.
- If student spoke well (all scores > 85): minor_errors = [], acknowledge briefly in coach_comment.
- scores: Calibrated integers 0-100. A1 student with errors → 40-60, NOT 75+. Be honest.
- Do not invent errors that were not in the audio.`;

const model = genAI.getGenerativeModel({ 
  model: "gemini-3.1-flash-lite",
  systemInstruction: SYSTEM_INSTRUCTION,
  generationConfig: {
    // TAREA 10.1: Desactivar reasoning tokens para ganar ~30s de latencia
    // @ts-ignore - 'thinkingConfig' existe en la API pero puede no estar en los tipos locales aún
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: "application/json"
  }
});

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * TAREA 10.4: Constructor de prompt dinámico
 */
const buildUserPrompt = (userName: string, level: string, history: string): string => `
Student: ${userName} | Level: ${level}
${history ? `PAST CONTEXT & ERRORS TO WATCH:\n${history}` : "First interaction today."}

Analyze the audio and return exactly this JSON structure:
{
  "original_transcript": "...",
  "corrected_version": "...",
  "corrected_version_es": "...",
  "key_error": {
    "what": "...",
    "fix": "...",
    "pattern": "...",
    "your_case": "..."
  },
  "minor_errors": [
    { "what": "...", "fix": "..." }
  ],
  "coach_comment": "...",
  "follow_up": "...",
  "follow_up_es": "...",
  "scores": { "grammar": 0, "pronunciation": 0, "fluency": 0, "vocabulary": 0 },
  "cefr": "A1"
}`;

export const analyzeVoiceAndProvideFeedback = async (
  userId: string,
  mp3FilePath: string, 
  userName: string, 
  level: string = "A1"
): Promise<TutorFeedbackV3> => {
  
  // 1. Recuperar contexto histórico del usuario (RAG)
  let historicalContext = "";
  try {
    const memories = await EmbeddingService.findRelevant(userId, "General English progress and common mistakes");
    if (memories.length > 0) {
      historicalContext = memories.map(m => m.content).join('\n');
    }
  } catch (e) {
    console.warn("⚠️ [RAG Warning]: No se pudieron cargar memorias.", e);
  }

  // 2. Lectura asíncrona del audio
  const audioBuffer = await fs.promises.readFile(mp3FilePath);
  const audioData = audioBuffer.toString("base64");

  let lastError: any;
  const maxRetries = 2;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`📡 Inferencia V3 (Thinking: 0) - Intento ${i + 1}...`);
      
      const result = await model.generateContent([
        buildUserPrompt(userName, level, historicalContext),
        {
          inlineData: {
            data: audioData,
            mimeType: "audio/mp3",
          },
        },
      ]);
    
      const responseText = result.response.text();
      console.log("=== DEBUG GEMINI RESPONSE ===");
      console.log(responseText);
      console.log("=============================");
      
      // Limpieza robusta de JSON
      const firstBracket = responseText.indexOf('{');
      const lastBracket = responseText.lastIndexOf('}');

      if (firstBracket === -1 || lastBracket === -1) {
        throw new Error("Invalid JSON from Gemini");
      }

      const jsonString = responseText.substring(firstBracket, lastBracket + 1);
      return JSON.parse(jsonString) as TutorFeedbackV3;

    } catch (error: any) {
      lastError = error;
      if (error.status === 503 || error.message?.includes("503")) {
        console.warn(`⚠️ 503 Overloaded. Retry in ${1000 * (i + 1)}ms...`);
        await delay(1000 * (i + 1));
        continue;
      }
      break;
    }
  }

  throw new Error(`AI Process failed: ${lastError?.message}`);
};

/**
 * Genera un reto de texto personalizado usando la IA de Gemini
 */
export const generateAIChallenge = async (userName: string, level: string, weakPoints: string[]): Promise<string> => {
  try {
    const prompt = `
      Create a 1-sentence English practice challenge for ${userName} (Level: ${level}).
      Focus: ${weakPoints.length > 0 ? weakPoints.join(', ') : 'Daily life'}.
      
      Format:
      1 sentence in Spanish explaining the challenge + 1 direct question in English.
      Max 180 characters total. No flattery.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Error generating AI challenge:", error);
    return `🚀 RETO: ¡Es hora de practicar! Cuéntame qué hiciste hoy en 10 segundos.`;
  }
};

