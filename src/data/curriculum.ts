export interface CurriculumTopic {
  id: string;
  title: string;
  description: string;
}

export const CEFR_CURRICULUM: Record<string, CurriculumTopic[]> = {
  'A1': [
    { id: 'a1_greetings', title: 'Greetings & Introductions', description: 'Saying hello, goodbye, and introducing yourself.' },
    { id: 'a1_present_simple', title: 'Daily Routines (Present Simple)', description: 'Describing what you do every day using basic verbs.' },
    { id: 'a1_family', title: 'Family & Friends', description: 'Talking about family members and basic relationships.' },
    { id: 'a1_food', title: 'Food & Drink', description: 'Ordering food and expressing basic preferences.' }
  ],
  'A2': [
    { id: 'a2_past_simple', title: 'Telling Stories (Past Simple)', description: 'Describing events that happened in the past.' },
    { id: 'a2_future_plans', title: 'Future Plans (Going to / Will)', description: 'Talking about vacations and future intentions.' },
    { id: 'a2_travel', title: 'Travel & Directions', description: 'Asking for directions and navigating a city.' },
    { id: 'a2_health', title: 'Health & Body', description: 'Describing symptoms at a doctor or pharmacy.' }
  ],
  'B1': [
    { id: 'b1_present_perfect', title: 'Life Experiences (Present Perfect)', description: 'Talking about things you have done in your life without specific timeframes.' },
    { id: 'b1_opinions', title: 'Expressing Opinions', description: 'Agreeing, disagreeing, and justifying your thoughts.' },
    { id: 'b1_work', title: 'Work & Careers', description: 'Describing job responsibilities and professional goals.' },
    { id: 'b1_conditionals', title: 'Hypothetical Situations (Conditionals)', description: 'Using First and Second conditionals for "what if" scenarios.' }
  ],
  'B2': [
    { id: 'b2_phrasal_verbs', title: 'Advanced Phrasal Verbs', description: 'Using idiomatic phrasal verbs naturally in conversation.' },
    { id: 'b2_abstract_concepts', title: 'Abstract Concepts', description: 'Discussing society, technology, and abstract ideas.' },
    { id: 'b2_nuance', title: 'Nuance & Emphasis', description: 'Using adverbs and cleft sentences to add emphasis.' }
  ],
  'C1': [
    { id: 'c1_idioms', title: 'Native Idioms & Slang', description: 'Incorporating natural slang and idiomatic expressions.' },
    { id: 'c1_complex_debates', title: 'Complex Debates', description: 'Defending complex arguments with sophisticated vocabulary.' },
    { id: 'c1_irony', title: 'Irony & Sarcasm', description: 'Understanding and using subtle irony and humor.' }
  ],
  'C2': [
    { id: 'c2_academic', title: 'Academic Discourse', description: 'Discussing highly specialized or academic topics.' },
    { id: 'c2_cultural', title: 'Deep Cultural Nuances', description: 'Referencing pop culture, history, and deep cultural contexts.' }
  ]
};
