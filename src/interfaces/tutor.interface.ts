export interface StudentProfile {
  telegramId:     string;
  name:           string;
  level:          'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  goal:           string;
  session_count:  number;
  weak_points:    WeakPoint[];
}

export interface WeakPoint {
  type:      'grammar' | 'pronunciation';
  pattern:   string;
  frequency: number;
}

export interface TutorFeedbackV3 {
  original_transcript: string;    // Exactamente lo que dijo el usuario
  corrected_version:   string;    // Versión nativa fluida
  corrected_version_es: string;    // Traducción al español para constatar intención
  
  // ERROR PRINCIPAL — Solo 1 (el de mayor impacto comunicativo hoy)
  key_error: {
    what:      string;  // Fragmento erróneo exacto (max 10 palabras)
    fix:       string;  // Corrección (max 10 palabras)
    pattern:   string;  // Regla en español (MAX 12 palabras — obligatorio)
    your_case: string;  // "palabra_error→fix | palabra_error→fix" con palabras REALES del audio
  };

  // ERRORES MENORES — Máximo 2, sin explicación (solo par what→fix)
  minor_errors: Array<{ what: string; fix: string }>;

  // VOZ DEL COACH — Directo y humano, sin halago artificial
  coach_comment: string;  // 1 frase en español, MAX 20 palabras, honesta y directa
  follow_up:     string;  // Pregunta en inglés, MAX 15 palabras
  follow_up_es:  string;  // Traducción al español

  // MÉTRICAS — Solo números (las justificaciones verbosas se eliminan)
  scores: {
    grammar:       number;  // 0-100
    pronunciation: number;  // 0-100
    fluency:       number;  // 0-100
    vocabulary:    number;  // 0-100
  };

  // FASE 19: SPURRED REPETITION - Vocabulario nuevo a aprender
  new_vocabulary: Array<{
    word: string;     // Palabra o phrasal verb en inglés que debió usar
    meaning: string;  // Significado en español
  }>;

  // FASE 20: SPANGLISH DETECTION
  spanglish_used: Array<{
    spanish: string;  // Palabra que usó en español
    english: string;  // Su equivalente en inglés
  }>;

  // FASE 21: CURRICULUM MASTERY
  topic_mastered: boolean; // True si el Coach detecta que ya dominas el currentTopic actual

  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}

// FASE 23: SHADOWING FEEDBACK
export interface ShadowingFeedback {
  original_transcript: string; // Lo que el usuario dijo
  pronunciation_score: number; // 0-100
  feedback_es:         string; // Qué falló (ej: "Pronunciaste 'sheet' como 'shit', alarga la 'i'.")
  passed:              boolean; // Si superó la prueba (>85)
  next_phrase:         string; // La siguiente frase a repetir generada con Opción C
  next_phrase_es:      string; // Traducción de la frase
}
