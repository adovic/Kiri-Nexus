// ===========================================
// SMART SUGGESTION ENGINE - Commercial Demo
// ===========================================
// Generates context-aware suggestions based on
// time of day and recent conversation context.

export interface Suggestion {
  text: string;
  category: 'inventory' | 'device' | 'table' | 'reporting';
}

// ===========================================
// TIME-OF-DAY BUCKETS
// ===========================================

type TimeBucket = 'PREP' | 'RUSH' | 'CLOSING' | 'OFF';

function getTimeBucket(hour: number): TimeBucket {
  // PREP: 6AM - 11AM
  if (hour >= 6 && hour < 11) return 'PREP';
  // RUSH: 11AM - 2PM
  if (hour >= 11 && hour < 14) return 'RUSH';
  // RUSH: 5PM - 9PM
  if (hour >= 17 && hour < 21) return 'RUSH';
  // CLOSING: 9PM - 2AM
  if (hour >= 21 || hour < 2) return 'CLOSING';
  // OFF: 2AM - 6AM or 2PM - 5PM (lull)
  return 'OFF';
}

// ===========================================
// BASE SUGGESTIONS PER BUCKET
// ===========================================

const BUCKET_SUGGESTIONS: Record<TimeBucket, Suggestion[]> = {
  PREP: [
    { text: 'Check steak count', category: 'inventory' },
    { text: 'Is the POS online?', category: 'device' },
    { text: 'How many napkins left?', category: 'inventory' },
    { text: 'Unlock the front door', category: 'device' },
    { text: 'How many wine bottles?', category: 'inventory' },
    { text: 'Is the printer working?', category: 'device' },
  ],
  RUSH: [
    { text: 'Mark Table 4 occupied', category: 'table' },
    { text: 'Print receipt for Table 2', category: 'table' },
    { text: 'How many steaks left?', category: 'inventory' },
    { text: 'Check printer status', category: 'device' },
    { text: 'Is the front door locked?', category: 'device' },
    { text: 'Check wine bottle count', category: 'inventory' },
  ],
  CLOSING: [
    { text: 'Total sales today?', category: 'reporting' },
    { text: 'Lock front door', category: 'device' },
    { text: 'How many steaks remain?', category: 'inventory' },
    { text: 'Shut down printer', category: 'device' },
    { text: 'Is the front door locked?', category: 'device' },
    { text: 'Final napkin count', category: 'inventory' },
  ],
  OFF: [
    { text: 'How many steaks do we have?', category: 'inventory' },
    { text: 'Is the front door locked?', category: 'device' },
    { text: 'Unlock the front door', category: 'device' },
    { text: 'What\'s the printer status?', category: 'device' },
    { text: 'Check wine inventory', category: 'inventory' },
    { text: 'Check napkin count', category: 'inventory' },
  ],
};

// ===========================================
// CONTEXT-AWARE FOLLOW-UPS
// ===========================================

// If the last message mentioned "Table X", inject table-specific follow-ups
const TABLE_REGEX = /table\s+(\d+)/i;

function getContextSuggestions(lastMessage: string): Suggestion[] {
  const tableMatch = lastMessage.match(TABLE_REGEX);
  if (tableMatch) {
    const tableNum = tableMatch[1];
    return [
      { text: `Get bill for Table ${tableNum}`, category: 'table' },
      { text: `Mark Table ${tableNum} as dirty`, category: 'table' },
    ];
  }
  return [];
}

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Returns up to `limit` suggestions based on current time and
 * the last transcript message for context awareness.
 */
export function getSuggestions(
  lastMessage: string = '',
  limit: number = 4
): Suggestion[] {
  const hour = new Date().getHours();
  const bucket = getTimeBucket(hour);

  // Start with context-aware suggestions (highest priority)
  const contextual = getContextSuggestions(lastMessage);

  // Fill remaining slots from the time-bucket pool
  const baseSuggestions = BUCKET_SUGGESTIONS[bucket];

  // Deduplicate: skip base suggestions whose text matches a contextual one
  const contextTexts = new Set(contextual.map(s => s.text.toLowerCase()));
  const filtered = baseSuggestions.filter(
    s => !contextTexts.has(s.text.toLowerCase())
  );

  return [...contextual, ...filtered].slice(0, limit);
}

/**
 * Returns the label for the current time bucket (for UI display).
 */
export function getCurrentBucketLabel(): string {
  const hour = new Date().getHours();
  const bucket = getTimeBucket(hour);
  const labels: Record<TimeBucket, string> = {
    PREP: 'Prep Mode',
    RUSH: 'Rush Mode',
    CLOSING: 'Closing Mode',
    OFF: 'Standby',
  };
  return labels[bucket];
}
