import { NextRequest, NextResponse } from 'next/server';
import {
  getInventoryItem,
  getDevice,
  updateDeviceStatus,
  listDeviceIds,
  listInventoryItems,
  getState,
  addShiftNote,
} from '@/lib/commercial/device-state';

// ===========================================
// VAPI TOOL EXECUTION HANDLER - COMMERCIAL
// ===========================================
// Receives POST requests from Vapi's Server URL webhook
// Executes the matching function from device-state
// Returns results in Vapi-expected format

// ===========================================
// TYPE DEFINITIONS
// ===========================================

interface VapiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface VapiMessage {
  type: string;
  toolCalls?: VapiToolCall[];
  toolCallList?: VapiToolCall[]; // Alternative field name
  call?: {
    id: string;
    customer?: {
      number?: string;
    };
  };
}

interface VapiPayload {
  message: VapiMessage;
}

interface ToolResult {
  toolCallId: string;
  result: string;
}

// ===========================================
// TOOL EXECUTION FUNCTIONS
// ===========================================

function executeCheckInventory(args: { item_name: string }): string {
  const quantity = getInventoryItem(args.item_name);

  if (quantity === null) {
    const available = listInventoryItems().join(', ');
    return `I couldn't find "${args.item_name}" in inventory. Available items: ${available}.`;
  }

  const displayName = args.item_name.replace(/_/g, ' ');

  if (quantity === 0) {
    return `We are out of ${displayName}. Current stock: 0. You may want to reorder.`;
  }

  return `We have ${quantity} ${displayName} in stock.`;
}

function executeGetDeviceStatus(args: { device_id: string }): string {
  const device = getDevice(args.device_id);

  if (!device) {
    const available = listDeviceIds().join(', ');
    return `Device "${args.device_id}" not found. Known devices: ${available}.`;
  }

  const displayName = args.device_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return `${displayName} (${device.type}) is currently ${device.status.toUpperCase()}.`;
}

function executeControlDevice(args: { device_id: string; action: string }): string {
  const device = getDevice(args.device_id);

  if (!device) {
    const available = listDeviceIds().join(', ');
    return `Device "${args.device_id}" not found. Known devices: ${available}.`;
  }

  const displayName = args.device_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const actionLower = args.action.toLowerCase().trim();

  // Map common actions to status values
  const actionMap: Record<string, string> = {
    unlock: 'unlocked',
    lock: 'locked',
    on: 'online',
    off: 'offline',
    online: 'online',
    offline: 'offline',
    restart: 'online',
    enable: 'online',
    disable: 'offline',
  };

  const newStatus = actionMap[actionLower] || actionLower;

  // State validation: prevent redundant commands
  const currentState = device.status.toLowerCase();
  if (actionLower === 'unlock' && currentState === 'unlocked') {
    return `${displayName} is ALREADY unlocked. No action taken.`;
  }
  if (actionLower === 'lock' && currentState === 'locked') {
    return `${displayName} is ALREADY locked. No action taken.`;
  }

  const updated = updateDeviceStatus(args.device_id, newStatus);

  if (!updated) {
    return `Failed to update ${displayName}. Please try again.`;
  }

  return JSON.stringify({
    result: `${displayName} is now ${newStatus.toUpperCase()}.`,
    device_id: args.device_id,
    previous_status: device.status,
    new_status: newStatus,
  });
}

// ===========================================
// RBAC - ROLE-BASED ACCESS CONTROL
// ===========================================

const USER_ROLES: Record<string, string> = {
  '9999': 'MANAGER',
  '0000': 'STAFF',
};

const PRIVILEGED_ACTIONS = ['unlock', 'open_safe'];

// ===========================================
// AUTHENTICATION - FAIL CLOSED
// ===========================================
// SECURITY: No fallback secrets. If VAPI_WEBHOOK_SECRET is not configured,
// the endpoint returns 503 Service Unavailable with a clear error message.
// ===========================================

function getVapiSecret(): string | null {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || secret.startsWith('YOUR_')) {
    return null;
  }
  return secret;
}

function isAuthorized(request: NextRequest): boolean {
  const configuredSecret = getVapiSecret();
  if (!configuredSecret) {
    return false; // Will trigger 503 in handler
  }
  const requestSecret = request.headers.get('x-vapi-secret');
  return requestSecret === configuredSecret;
}

// ===========================================
// MAIN HANDLER
// ===========================================

export async function POST(request: NextRequest) {
  // Check if webhook secret is configured (fail closed)
  if (!getVapiSecret()) {
    console.error('[Commercial Tools] VAPI_WEBHOOK_SECRET not configured - endpoint disabled');
    return NextResponse.json(
      {
        error: 'Service Unavailable',
        hint: 'VAPI_WEBHOOK_SECRET environment variable is not configured',
        configRequired: true,
      },
      { status: 503 }
    );
  }

  // Auth gate
  if (!isAuthorized(request)) {
    console.warn('[Commercial Tools] Unauthorized request blocked');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: VapiPayload = await request.json();

    // Check if this is a tool-calls message
    if (body.message?.type !== 'tool-calls') {
      // Return empty response for other message types
      return NextResponse.json({ success: true });
    }

    // Get tool calls array (Vapi may use either field name)
    const toolCalls = body.message.toolCalls || body.message.toolCallList || [];

    if (toolCalls.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Process each tool call
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      let result: string;

      try {
        // Parse arguments
        const args = JSON.parse(toolCall.function.arguments || '{}');

        console.log('[Commercial Tools] Executing tool:', toolCall.function.name);

        // Execute the appropriate function
        switch (toolCall.function.name) {
          case 'check_inventory':
            result = executeCheckInventory(args);
            break;

          case 'get_device_status':
            result = executeGetDeviceStatus(args);
            break;

          case 'control_device': {
            // RBAC: Validate PIN and check role for privileged actions
            const pin = args.pin_code || '';
            const role = USER_ROLES[pin];

            if (!role) {
              result = 'ACCESS DENIED. Invalid PIN code. Please provide a valid staff PIN.';
              break;
            }

            const actionLower = (args.action || '').toLowerCase().trim();
            if (PRIVILEGED_ACTIONS.includes(actionLower) && role !== 'MANAGER') {
              result = 'ACCESS DENIED. Manager PIN required for this action.';
              break;
            }

            result = executeControlDevice(args);
            break;
          }

          case 'log_shift_note': {
            const entry = addShiftNote(args.author || 'Unknown', args.note || '');
            result = `Shift note logged by ${entry.author} at ${entry.timestamp}.`;
            break;
          }

          default:
            result = `Unknown tool: "${toolCall.function.name}". Available tools: check_inventory, get_device_status, control_device, log_shift_note.`;
            console.warn(`[Commercial Tools] Unknown function: ${toolCall.function.name}`);
        }
      } catch (parseError) {
        console.error(`[Commercial Tools] Error parsing arguments:`, parseError);
        result = `Error processing that request. Could you please try again?`;
      }

      results.push({
        toolCallId: toolCall.id,
        result,
      });
    }

    // Return results in Vapi format
    return NextResponse.json({ results });

  } catch (error) {
    console.error('[Commercial Tools] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error processing tool call' },
      { status: 500 }
    );
  }
}

// Handle GET requests (health check + live state for dashboard polling)
export async function GET() {
  const snapshot = getState();
  return NextResponse.json({
    status: 'ok',
    service: 'Commercial Facility Tools API',
    inventory: snapshot.inventory,
    devices: snapshot.devices,
    units: snapshot.units,
  });
}
