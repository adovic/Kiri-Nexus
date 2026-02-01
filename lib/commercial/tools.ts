// ===========================================
// COMMERCIAL AI TOOLS - FUNCTION DEFINITIONS
// ===========================================
// OpenAI/Vapi Function Calling schemas for the Commercial Facility AI
// These define what tools the AI can invoke during a conversation

// ===========================================
// TYPE DEFINITIONS
// ===========================================

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

export interface Tool {
  type: 'function';
  function: ToolFunction;
}

// ===========================================
// COMMERCIAL TOOLS ARRAY
// ===========================================

export const COMMERCIAL_TOOLS: Tool[] = [
  // -----------------------------------------
  // CHECK INVENTORY
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'check_inventory',
      description:
        'Check the current inventory count for a specific item. Use this when someone asks how much of something is in stock, whether an item is available, or needs a supply count.',
      parameters: {
        type: 'object',
        properties: {
          item_name: {
            type: 'string',
            description:
              'The name of the inventory item to check (e.g., "steak", "wine_bottles", "napkins"). Use underscores for multi-word items.',
          },
        },
        required: ['item_name'],
      },
    },
  },

  // -----------------------------------------
  // GET DEVICE STATUS
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'get_device_status',
      description:
        'Get the current status of a connected device in the facility. Use this when someone asks about a door lock, printer, or any IoT device.',
      parameters: {
        type: 'object',
        properties: {
          device_id: {
            type: 'string',
            description:
              'The ID of the device to check (e.g., "front_door", "printer_01"). Use underscores for multi-word IDs.',
          },
        },
        required: ['device_id'],
      },
    },
  },

  // -----------------------------------------
  // CONTROL DEVICE
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'control_device',
      description:
        'Send a control command to a connected device. Use this to lock/unlock doors, turn devices on/off, or change device state. Requires a staff PIN code for authorization.',
      parameters: {
        type: 'object',
        properties: {
          device_id: {
            type: 'string',
            description:
              'The ID of the device to control (e.g., "front_door", "printer_01").',
          },
          action: {
            type: 'string',
            description:
              'The action to perform on the device (e.g., "unlock", "lock", "online", "offline", "restart").',
          },
          pin_code: {
            type: 'string',
            description:
              'The staff PIN code for authorization. Ask the user for their PIN before executing any device control.',
          },
        },
        required: ['device_id', 'action', 'pin_code'],
      },
    },
  },

  // -----------------------------------------
  // LOG SHIFT NOTE
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'log_shift_note',
      description:
        'Log a shift note for the current shift. Use this when someone wants to leave a message or note for the next shift, or to record an observation.',
      parameters: {
        type: 'object',
        properties: {
          author: {
            type: 'string',
            description:
              'The name of the person leaving the note (e.g., "Manager Mike").',
          },
          note: {
            type: 'string',
            description:
              'The content of the shift note (e.g., "Table 4 needs deep clean", "Wine delivery expected at 3pm").',
          },
        },
        required: ['author', 'note'],
      },
    },
  },
];

// ===========================================
// TOOL NAME TYPE (for type safety)
// ===========================================

export type CommercialToolName =
  | 'check_inventory'
  | 'get_device_status'
  | 'control_device'
  | 'log_shift_note';

// ===========================================
// HELPER: Get tool by name
// ===========================================

export function getToolByName(name: CommercialToolName): Tool | undefined {
  return COMMERCIAL_TOOLS.find((tool) => tool.function.name === name);
}

// ===========================================
// HELPER: Get all tool names
// ===========================================

export function getToolNames(): string[] {
  return COMMERCIAL_TOOLS.map((tool) => tool.function.name);
}

// ===========================================
// SUBSET EXPORTS (for different AI personas)
// ===========================================

// Inventory-only tools
export const INVENTORY_TOOLS: Tool[] = COMMERCIAL_TOOLS.filter((tool) =>
  ['check_inventory'].includes(tool.function.name)
);

// Device management tools
export const DEVICE_TOOLS: Tool[] = COMMERCIAL_TOOLS.filter((tool) =>
  ['get_device_status', 'control_device'].includes(tool.function.name)
);

// All tools for full-featured demo
export const DEMO_TOOLS: Tool[] = COMMERCIAL_TOOLS;
