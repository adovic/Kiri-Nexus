// ===========================================
// COMMERCIAL FACILITY - IN-MEMORY STATE
// ===========================================
// Simulated device/inventory database for Kiri Nexus Commercial demo
// Supports JIT seeding for Restaurant, Retail, and Hotel modes

// ===========================================
// TYPE DEFINITIONS
// ===========================================

export interface DeviceInfo {
  status: string;
  type: string;
}

export interface UnitInfo {
  status: string;
  type: string;
  bill?: number;
}

export interface ShiftNote {
  author: string;
  note: string;
  timestamp: string;
}

export interface FacilityState {
  inventory: Record<string, number>;
  devices: Record<string, DeviceInfo>;
  units: Record<string, UnitInfo>;
  shift_notes: ShiftNote[];
}

// ===========================================
// INDUSTRY SEED TEMPLATES
// ===========================================

export type IndustryKey = 'restaurant' | 'retail' | 'hotel';

const SEEDS: Record<IndustryKey, Omit<FacilityState, 'shift_notes'>> = {
  restaurant: {
    inventory: {
      steak: 5,
      wine_bottles: 12,
      napkins: 500,
    },
    devices: {
      front_door: { status: 'locked', type: 'smart_lock' },
      printer_01: { status: 'online', type: 'printer' },
    },
    units: {
      table_1: { status: 'open', type: 'table' },
      table_4: { status: 'occupied', type: 'table', bill: 120.50 },
    },
  },
  retail: {
    inventory: {
      jeans: 45,
      t_shirts: 120,
      sneakers: 30,
    },
    devices: {
      front_door: { status: 'locked', type: 'smart_lock' },
      pos_terminal: { status: 'online', type: 'pos' },
    },
    units: {
      reg_01: { status: 'active', type: 'register' },
      reg_02: { status: 'closed', type: 'register' },
    },
  },
  hotel: {
    inventory: {
      towels: 200,
      shampoo: 150,
      robes: 50,
    },
    devices: {
      front_door: { status: 'locked', type: 'smart_lock' },
      printer_01: { status: 'online', type: 'printer' },
    },
    units: {
      rm_101: { status: 'clean', type: 'room' },
      rm_102: { status: 'occupied', type: 'room' },
      rm_201: { status: 'dirty', type: 'room' },
    },
  },
};

// ===========================================
// ACTIVE STATE
// ===========================================

let activeIndustry: IndustryKey = 'restaurant';

const state: FacilityState = {
  inventory: { ...SEEDS.restaurant.inventory },
  devices: JSON.parse(JSON.stringify(SEEDS.restaurant.devices)),
  units: JSON.parse(JSON.stringify(SEEDS.restaurant.units)),
  shift_notes: [],
};

// ===========================================
// JIT SEEDING
// ===========================================

/**
 * Map a raw industry string from the setup wizard
 * to a known seed key. Falls back to 'restaurant'.
 */
function resolveIndustry(raw: string): IndustryKey {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('retail') || lower.includes('fashion')) return 'retail';
  if (lower.includes('hotel') || lower.includes('hospitality')) return 'hotel';
  return 'restaurant';
}

/**
 * Initialize (or re-initialize) the facility state
 * with the seed template for the given industry.
 */
export function initializeState(industry: string): IndustryKey {
  const key = resolveIndustry(industry);
  activeIndustry = key;
  const seed = SEEDS[key];
  state.inventory = { ...seed.inventory };
  state.devices = JSON.parse(JSON.stringify(seed.devices));
  state.units = JSON.parse(JSON.stringify(seed.units));
  state.shift_notes = [];
  return key;
}

/**
 * Get the currently active industry key.
 */
export function getActiveIndustry(): IndustryKey {
  return activeIndustry;
}

// ===========================================
// GETTER HELPERS
// ===========================================

/**
 * Get the full facility state snapshot (read-only copy)
 */
export function getState(): FacilityState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Get the quantity of an inventory item
 */
export function getInventoryItem(itemName: string): number | null {
  const key = itemName.toLowerCase().trim().replace(/\s+/g, '_');
  if (key in state.inventory) {
    return state.inventory[key];
  }
  return null;
}

/**
 * Get the status of a device
 */
export function getDevice(deviceId: string): DeviceInfo | null {
  const key = deviceId.toLowerCase().trim().replace(/\s+/g, '_');
  if (key in state.devices) {
    return { ...state.devices[key] };
  }
  return null;
}

/**
 * Get unit info (table, room, register, etc.)
 */
export function getUnit(unitId: string): UnitInfo | null {
  const key = unitId.toLowerCase().trim().replace(/\s+/g, '_');
  if (key in state.units) {
    return { ...state.units[key] };
  }
  return null;
}

// Keep backward-compatible alias
export const getTable = getUnit;

// ===========================================
// UPDATE HELPERS
// ===========================================

/**
 * Update the status of a device
 */
export function updateDeviceStatus(deviceId: string, newStatus: string): boolean {
  const key = deviceId.toLowerCase().trim().replace(/\s+/g, '_');
  if (key in state.devices) {
    state.devices[key].status = newStatus;
    return true;
  }
  return false;
}

/**
 * Update the quantity of an inventory item
 */
export function updateInventoryItem(itemName: string, quantity: number): boolean {
  const key = itemName.toLowerCase().trim().replace(/\s+/g, '_');
  if (key in state.inventory) {
    state.inventory[key] = quantity;
    return true;
  }
  return false;
}

/**
 * List all known device IDs
 */
export function listDeviceIds(): string[] {
  return Object.keys(state.devices);
}

/**
 * List all known inventory item names
 */
export function listInventoryItems(): string[] {
  return Object.keys(state.inventory);
}

// ===========================================
// SHIFT NOTES
// ===========================================

/**
 * Add a shift note
 */
export function addShiftNote(author: string, note: string): ShiftNote {
  const entry: ShiftNote = {
    author,
    note,
    timestamp: new Date().toISOString(),
  };
  state.shift_notes.push(entry);
  return entry;
}

/**
 * Get all shift notes
 */
export function getShiftNotes(): ShiftNote[] {
  return [...state.shift_notes];
}

// ===========================================
// RESET
// ===========================================

/**
 * Reset facility state to seed values for the current
 * (or optionally a new) industry.
 */
export function resetCommercialData(industry?: string): IndustryKey {
  return initializeState(industry || activeIndustry);
}
