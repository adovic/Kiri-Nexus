// ===========================================
// SMART SUGGESTIONS ENGINE - Commercial Demo
// ===========================================
// Generates context-aware suggestions based on
// simulation time mode and the last tool call result.

import type { TimeMode, LastToolCall } from './simulation-context';

export interface SmartSuggestion {
  label: string;
  category: 'inventory' | 'device' | 'table' | 'reporting' | 'action';
}

// ===========================================
// CONTEXTUAL SUGGESTIONS (highest priority)
// ===========================================

function getContextualSuggestions(lastToolCall: LastToolCall | null): SmartSuggestion[] | null {
  if (!lastToolCall) return null;

  const resultLower = (lastToolCall.result || '').toLowerCase();

  // After inventory check — if low or zero, suggest reorder / 86
  if (lastToolCall.name === 'check_inventory') {
    const isLow = /\b(0|1|2|low|out of stock|none)\b/.test(resultLower);
    if (isLow) {
      return [
        { label: 'Order more from supplier', category: 'action' },
        { label: '86 this item', category: 'action' },
        { label: 'Check another item', category: 'inventory' },
      ];
    }
  }

  // After device status — if locked, suggest unlock
  if (lastToolCall.name === 'get_device_status') {
    if (resultLower.includes('locked')) {
      return [
        { label: 'Unlock it', category: 'device' },
        { label: 'Check another device', category: 'device' },
        { label: 'Check inventory', category: 'inventory' },
      ];
    }
    if (resultLower.includes('offline') || resultLower.includes('error')) {
      return [
        { label: 'Restart this device', category: 'device' },
        { label: 'Check another device', category: 'device' },
      ];
    }
  }

  // After device control — suggest verifying
  if (lastToolCall.name === 'control_device') {
    return [
      { label: 'Verify device status', category: 'device' },
      { label: 'Check inventory', category: 'inventory' },
    ];
  }

  return null;
}

// ===========================================
// TIME-BASED DEFAULT SUGGESTIONS
// ===========================================

const TIME_SUGGESTIONS: Record<TimeMode, SmartSuggestion[]> = {
  prep: [
    { label: 'System Check: Printers', category: 'device' },
    { label: 'Inventory: Steaks', category: 'inventory' },
    { label: 'Unlock Front Door', category: 'device' },
    { label: 'Check napkin count', category: 'inventory' },
  ],
  rush: [
    { label: 'Table Status: Who is waiting?', category: 'table' },
    { label: '86 List', category: 'inventory' },
    { label: 'Check printer status', category: 'device' },
    { label: 'How many steaks left?', category: 'inventory' },
  ],
  closing: [
    { label: 'Lock Front Door', category: 'device' },
    { label: 'Run Sales Report', category: 'reporting' },
    { label: 'Final steak count', category: 'inventory' },
    { label: 'Shut down printer', category: 'device' },
  ],
};

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Returns smart suggestions based on the current time mode
 * and the last tool call result. Contextual suggestions
 * (from tool results) take priority over time-based defaults.
 */
export function getCommercialSuggestions(
  timeMode: TimeMode,
  lastToolCall: LastToolCall | null
): SmartSuggestion[] {
  const contextual = getContextualSuggestions(lastToolCall);
  if (contextual) return contextual;
  return TIME_SUGGESTIONS[timeMode];
}
