import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import { env } from "@config/env";
import { TutorFeedbackV3, ShadowingFeedback } from "@interfaces/tutor.interface";
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
- new_vocabulary: MAX 2 items. Be PROACTIVE. If they use basic words (e.g. "very big"), suggest better ones ("massive", "huge"). Format: { "word": "English word", "meaning": "Spanish translation" }.
- SPANGLISH / CODE-SWITCHING RULE: If the student uses Spanish words mid-sentence (e.g. "the tienda"), do NOT treat them as pronunciation errors. List them in "spanglish_used". coach_comment should be EMPATHETIC: "No sabes la palabra aún, ¡es normal!". Add them to new_vocabulary.
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

// Modelo separado para texto libre (cron de retos diarios).
// NO hereda el systemInstruction de evaluación ni fuerza JSON.
const textModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
});

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * TAREA 10.4 / FASE 19, 20 & 21: Constructor de prompt dinámico
 */
const buildUserPrompt = (userName: string, level: string, history: string, wordsToReview: string[] = [], lastQuestion: string | null = null, activeTopic: any = null): string => `
Student: ${userName} | Level: ${level}
${history ? `PAST CONTEXT & ERRORS TO WATCH:\n${history}` : "First interaction today."}

${lastQuestion ? `PREVIOUS SESSION BRIDGE: Last time, you asked the student: "${lastQuestion}". If their audio seems to be answering this, acknowledge it naturally in your coach_comment.` : ""}
${wordsToReview.length > 0 ? `\n🔥 SPACED REPETITION TARGETS: The student MUST practice these words today: [${wordsToReview.join(', ')}]. \nCRITICAL: Craft your 'follow_up' question specifically so the natural answer requires using one of these words.` : ""}
${activeTopic ? `\n🎯 CURRICULUM FOCUS: The student is currently practicing: "${activeTopic.title}" (${activeTopic.description}).
CRITICAL (FLEXIBLE CURRICULUM): Guide your follow_up question toward this topic. However, if the user's audio is clearly talking about something else important to them, follow their lead empathetically and ignore the curriculum for this turn.
If they DO practice the topic and demonstrate competence, set "topic_mastered": true.` : ""}

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
  "new_vocabulary": [
    { "word": "...", "meaning": "..." }
  ],
  "spanglish_used": [
    { "spanish": "...", "english": "..." }
  ],
  "topic_mastered": false,
  "coach_comment": "...",
  "follow_up": "...",
  "follow_up_es": "...",
  "scores": { "grammar": 0, "pronunciation": 0, "fluency": 0, "vocabulary": 0 },
  "cefr": "A1"
}`;

// FASE 23: Constructor de prompt para Shadowing Mode (Opción C)
const buildShadowingPrompt = (userName: string, targetPhrase: string, historicalContext: string): string => `
Student: ${userName}
MODE: SHADOWING / PRONUNCIATION DRILL
TARGET PHRASE THEY ARE TRYING TO SAY: "${targetPhrase}"

${historicalContext ? `PAST CONTEXT & WEAK POINTS:\n${historicalContext}` : ""}

INSTRUCTIONS:
1. DO NOT evaluate grammar. ONLY evaluate their pronunciation of the TARGET PHRASE.
2. Calculate a pronunciation_score from 0 to 100.
3. If score < 85, passed = false. feedback_es MUST tell them exactly what sound they failed (e.g. "Dijiste 'shit' en vez de 'sheet'. Alarga la 'i'.").
4. If score >= 85, passed = true. feedback_es MUST congratulate them.
5. GENERATE NEXT PHRASE (Opción C): Look at their WEAK POINTS in the context. Generate a new, native, movie-like idiom/phrase that contains a grammar rule or word they struggle with. 

Analyze the audio and return exactly this JSON structure:
{
  "original_transcript": "...",
  "pronunciation_score": 0,
  "feedback_es": "...",
  "passed": false,
  "next_phrase": "...",
  "next_phrase_es": "..."
}
`;

export const analyzeVoiceAndProvideFeedback = async (
  userId: string,
  mp3FilePath: string, 
  userName: string, 
  level: string = "A1",
  wordsToReview: string[] = [],
  lastQuestion: string | null = null,
  activeTopic: any = null,
  mode: string = "conversation",
  targetPhrase: string | null = null
): Promise<TutorFeedbackV3 | ShadowingFeedback> => {
  
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
      console.log(`📡 Inferencia V3 (Thinking: 0) - Intento ${i + 1} - Modo: ${mode}...`);
      
      const prompt = mode === 'shadowing' && targetPhrase
          ? buildShadowingPrompt(userName, targetPhrase, historicalContext)
          : buildUserPrompt(userName, level, historicalContext, wordsToReview, lastQuestion, activeTopic);

      const result = await model.generateContent([
        prompt,
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

    const result = await textModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Error generating AI challenge:", error);
    return `🚀 RETO: ¡Es hora de practicar! Cuéntame qué hiciste hoy en 10 segundos.`;
  }
};

