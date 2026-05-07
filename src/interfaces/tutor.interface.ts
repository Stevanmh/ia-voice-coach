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

export interface ScoreJustification {
  grammar:       string;
  pronunciation: string;
  fluency:       string;
  vocabulary:    string;
}

export interface TutorFeedback {
  original_transcript:  string;
  corrected_version:    string;
  corrected_version_translation: string; // Traducción al español
  grammar_errors:       GrammarError[];
  pronunciation_tips:   PronTip[];
  grammar_score:        number;
  pronunciation_score:  number;
  fluency_score:        number;
  vocabulary_score:     number;
  score_justifications: ScoreJustification;
  encouragement_message: string;
  follow_up_question:    string; // Pregunta en Inglés
  follow_up_translation: string; // Traducción en Español
  estimated_cefr_level:  'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}

export interface GrammarError {
  error:       string;
  correction:  string;
  explanation: string;
  rule:        string; // Regla gramatical sencilla
  examples:    { correct: string, incorrect: string }[];
}

export interface PronTip {
  word:  string;
  ipa:   string;
  tip:   string;
}
