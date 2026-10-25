// Response schemas in the Gemini responseSchema dialect.
export const WHY_SCHEMA = {
  type: 'OBJECT',
  required: ['transcript', 'in_scope', 'answer'],
  properties: {
    transcript: { type: 'STRING' },
    in_scope: { type: 'BOOLEAN' },
    answer: { type: 'STRING' },
    suggest_lab: { type: 'BOOLEAN' },
  },
} as const;

export const CASE_SCHEMA = {
  type: 'OBJECT',
  required: ['transcript', 'ideas_found', 'misconceptions_found', 'child_feedback', 'parent_note'],
  properties: {
    transcript: { type: 'STRING' },
    ideas_found: { type: 'ARRAY', items: { type: 'STRING' } },
    misconceptions_found: { type: 'ARRAY', items: { type: 'STRING' } },
    child_feedback: { type: 'STRING' },
    parent_note: { type: 'STRING' },
  },
} as const;

export const KEY_TEST_SCHEMA = {
  type: 'OBJECT', required: ['reply'], properties: { reply: { type: 'STRING' } },
} as const;
