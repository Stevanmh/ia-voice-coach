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

  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}
