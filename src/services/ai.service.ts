import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import { env } from "@config/env";
import { TutorFeedback } from "@interfaces/tutor.interface";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
// Usamos Gemini 2.5 Flash ya que la API Key actual no soporta modelos 1.5
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const analyzeVoiceAndProvideFeedback = async (mp3FilePath: string, userName: string = "Estudiante", history: string = ""): Promise<TutorFeedback> => {
  const audioData = Buffer.from(fs.readFileSync(mp3FilePath)).toString("base64");

  const prompt = `
    Act as a professional and ultra-personalized English Voice Coach for Spanish speakers. 
    Your goal is to have a NATURAL conversation with the student while teaching them.

    ANALYSIS RULES:
    1. Analyze the audio provided.
    2. Transcription and corrected version MUST be in English.
    3. THE CORE OF YOUR RESPONSE: "explanation", "rule", "tip", "encouragement_message" and "follow_up_question" MUST be in SPANISH.
    4. "follow_up_question": ALWAYS end with a natural follow-up question in ENGLISH.
    5. "follow_up_translation": Provide the Spanish translation of the follow_up_question.
    6. "grammar_errors": For EACH error, provide:
       - "rule": A very simple grammatical rule in Spanish.
       - "examples": 2 extra pairs of correct/incorrect examples related to that specific error.
    7. "estimated_cefr_level": Evaluate the student's current level (A1, A2, B1, B2, C1, C2).

    CONTEXT:
    The student's name is user_name_placeholder. 
    Previous conversation history (if any): history_placeholder.

    RESPONSE FORMAT (STRICT JSON):
    {
      "original_transcript": "...",
      "corrected_version": "...",
      "corrected_version_translation": "Traducción al español de la corrección",
      "grammar_errors": [
        {
          "error": "...",
          "correction": "...",
          "explanation": "...",
          "rule": "...",
          "examples": [{"correct": "...", "incorrect": "..."}]
        }
      ],
      "pronunciation_tips": [{"word": "...", "ipa": "...", "tip": "..."}],
      "grammar_score": 0-100,
      "pronunciation_score": 0-100,
      "fluency_score": 0-100,
      "vocabulary_score": 0-100,
      "score_justifications": {"grammar": "...", "pronunciation": "...", "fluency": "...", "vocabulary": "..."},
      "encouragement_message": "...",
      "follow_up_question": "...",
      "follow_up_translation": "...",
      "estimated_cefr_level": "A1-C2"
    }
  `;

  const finalPrompt = prompt
    .replace("user_name_placeholder", userName)
    .replace("history_placeholder", history || "No hay historial previo. Comienza una conversación desde cero.");

  let lastError: any;
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`📡 Intento ${i + 1} de comunicación con Gemini 3 (V2 Conversacional)...`);
      const result = await model.generateContent([
        finalPrompt,
        {
          inlineData: {
            data: audioData,
            mimeType: "audio/mp3",
          },
        },
      ]);
    
      const responseText = result.response.text();
      console.log("=== DEBUG: Respuesta bruta de Gemini ===");
      console.log(responseText);
      console.log("========================================");
      
      const firstBracket = responseText.indexOf('{');
      const lastBracket = responseText.lastIndexOf('}');

      if (firstBracket === -1 || lastBracket === -1) {
        throw new Error("La IA no devolvió un formato JSON válido.");
      }

      const jsonString = responseText.substring(firstBracket, lastBracket + 1);
      return JSON.parse(jsonString) as TutorFeedback;

    } catch (error: any) {
      lastError = error;
      // Si es un error de saturación (503), esperamos y reintentamos
      if (error.status === 503 || error.message?.includes("503")) {
        console.warn(`⚠️ Servidor saturado (503). Reintentando en ${2000 * (i + 1)}ms...`);
        await delay(2000 * (i + 1));
        continue;
      }
      // Si es otro error, lanzamos de una vez
      break;
    }
  }

  console.error("❌ Error definitivo en Gemini AI Service:", lastError);
  throw new Error("No se pudo procesar el audio con Gemini tras varios intentos");
};

/**
 * Genera un reto de texto personalizado usando la IA de Gemini
 */
export const generateAIChallenge = async (userName: string, level: string, weakPoints: string[]): Promise<string> => {
  try {
    const prompt = `
      Act as a professional and proactive English Voice Coach. 
      Create a highly personalized "Real-World Situation" challenge for your student ${userName} (Level: ${level}).
      Their current weak points are: ${weakPoints.length > 0 ? weakPoints.join(', ') : 'beginner basics'}.
      
      GOAL:
      Initiate a conversation by putting the student in a real situation (e.g., at a restaurant, job interview, traveling) where they MUST practice their weak points.
      Ask them a direct question to start the roleplay.
      
      OUTPUT RULES:
      - Language: SPANISH (but instructions/questions can be in English if needed).
      - Style: Natural, encouraging, like a personal tutor.
      - Max 250 characters.
      - Use "Tú" (informal Spanish).
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Error generating AI challenge:", error);
    return `🚀 RETO: ¡Es hora de practicar! Cuéntame qué hiciste hoy en 10 segundos.`;
  }
};

