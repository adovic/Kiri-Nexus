// ===========================================
// GOVERNMENT AI TOOLS - FUNCTION DEFINITIONS
// ===========================================
// OpenAI/Vapi Function Calling schemas for the Government AI Assistant
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
// GOVERNMENT TOOLS ARRAY
// ===========================================

export const GOVERNMENT_TOOLS: Tool[] = [
  // -----------------------------------------
  // PERMIT LOOKUP
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'lookup_permit',
      description:
        'Check the status of a building permit. Use this when a caller asks about their permit application, wants to know if a permit was approved, or needs information about a specific permit ID.',
      parameters: {
        type: 'object',
        properties: {
          permit_id: {
            type: 'string',
            description:
              'The permit ID number to look up (e.g., "P-101", "P-102"). The caller should provide this ID from their application documents.',
          },
        },
        required: ['permit_id'],
      },
    },
  },

  // -----------------------------------------
  // BUS SCHEDULE CHECK
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'check_bus_schedule',
      description:
        'Get the next arrival time for a specific bus route. Use this when a caller wants to know when the next bus is coming, check if a route is running, or get real-time transit information.',
      parameters: {
        type: 'object',
        properties: {
          route_number: {
            type: 'string',
            description:
              'The bus route number or ID to check (e.g., "51B", "6", "15"). This is typically displayed on bus stop signs.',
          },
        },
        required: ['route_number'],
      },
    },
  },

  // -----------------------------------------
  // HOUSING STATUS CHECK
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'check_housing_status',
      description:
        'Check the waitlist status of a housing application. Use this when a caller wants to know their position on the housing waitlist, check if their application is still active, or get an estimated wait time.',
      parameters: {
        type: 'object',
        properties: {
          application_id: {
            type: 'string',
            description:
              'The housing application ID to look up (e.g., "HA-990", "HA-991"). The caller received this ID when they submitted their application.',
          },
        },
        required: ['application_id'],
      },
    },
  },

  // -----------------------------------------
  // 311 SERVICE REQUEST
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'log_service_request',
      description:
        'Log a new 311 service request for city services. Use this when a caller wants to report an issue like a pothole, missed trash pickup, streetlight outage, graffiti, or other municipal concerns.',
      parameters: {
        type: 'object',
        properties: {
          issue_type: {
            type: 'string',
            description:
              'The type of issue being reported. Common types include: pothole, missed_trash, streetlight, graffiti, sidewalk_damage, noise_complaint, abandoned_vehicle, illegal_dumping, tree_hazard, water_leak.',
          },
          location: {
            type: 'string',
            description:
              'The address or location of the issue. Should include street address, cross streets, or a recognizable landmark. Be as specific as possible.',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description:
              'The urgency level of the request. Use "high" for safety hazards or emergencies, "medium" for issues affecting daily life, and "low" for cosmetic or minor issues.',
          },
        },
        required: ['issue_type', 'location', 'priority'],
      },
    },
  },

  // -----------------------------------------
  // VERIFY RESIDENT (Optional - for auth flows)
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'verify_resident',
      description:
        'Verify a resident\'s identity using their phone number and PIN. Use this before providing sensitive account information or processing requests that require authentication.',
      parameters: {
        type: 'object',
        properties: {
          phone_number: {
            type: 'string',
            description:
              'The resident\'s phone number. Can be in any format (e.g., "555-123-4567", "(555) 123-4567", "5551234567").',
          },
          pin: {
            type: 'string',
            description:
              'The 4-digit PIN the resident set up when registering for city services.',
          },
        },
        required: ['phone_number', 'pin'],
      },
    },
  },

  // -----------------------------------------
  // TRANSFER TO HUMAN
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'transfer_to_human',
      description:
        'Transfer the call to a human operator. Use this when the caller explicitly requests to speak with a person, when the issue is too complex to resolve, when there is an emergency, or when the caller is frustrated.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description:
              'Brief description of why the transfer is needed. This helps the human operator understand the context.',
          },
          department: {
            type: 'string',
            enum: [
              'general',
              'permits',
              'housing',
              'public_works',
              'police_non_emergency',
              'health',
              'transit',
              'billing',
            ],
            description:
              'The department to transfer the call to based on the nature of the inquiry.',
          },
          urgency: {
            type: 'string',
            enum: ['normal', 'urgent'],
            description:
              'Whether this is a normal transfer or an urgent matter that should be prioritized in the queue.',
          },
        },
        required: ['reason', 'department'],
      },
    },
  },

  // -----------------------------------------
  // SCHEDULE APPOINTMENT
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'schedule_appointment',
      description:
        'Schedule appointments for city services like fingerprinting, building inspections, vaccine shots, or passport renewal.',
      parameters: {
        type: 'object',
        properties: {
          service_type: {
            type: 'string',
            description:
              'The type of service to schedule (e.g., "fingerprinting", "building_inspection", "vaccine", "passport_renewal").',
          },
          date: {
            type: 'string',
            description:
              'The desired date for the appointment (e.g., "2024-01-15", "next Tuesday").',
          },
          time: {
            type: 'string',
            description:
              'The desired time for the appointment (e.g., "10:00 AM", "2:30 PM").',
          },
          citizen_name: {
            type: 'string',
            description:
              'The name of the person the appointment is for.',
          },
        },
        required: ['service_type', 'date', 'time', 'citizen_name'],
      },
    },
  },

  // -----------------------------------------
  // CHECK PAYMENT STATUS
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'check_payment_status',
      description:
        'Check the status of payments for rent assistance, utility bills, or parking citations.',
      parameters: {
        type: 'object',
        properties: {
          payment_reference_id: {
            type: 'string',
            description:
              'The unique ID for the payment (e.g., "PAY-123", "CIT-998").',
          },
          citizen_phone: {
            type: 'string',
            description:
              'The phone number associated with the account, used as an alternative lookup method.',
          },
        },
        required: [],
      },
    },
  },

  // -----------------------------------------
  // PROCESS MOCK PAYMENT
  // -----------------------------------------
  {
    type: 'function',
    function: {
      name: 'process_mock_payment',
      description:
        'Process a new payment for a fine, fee, or city service.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description:
              'The amount to be paid in dollars (e.g., 50.00, 120.50).',
          },
          service_type: {
            type: 'string',
            description:
              'What the payment is for (e.g., "parking_citation", "rent_assistance", "permit_fee").',
          },
        },
        required: ['amount', 'service_type'],
      },
    },
  },
];

// ===========================================
// TOOL NAME TYPE (for type safety)
// ===========================================

export type GovernmentToolName =
  | 'lookup_permit'
  | 'check_bus_schedule'
  | 'check_housing_status'
  | 'log_service_request'
  | 'verify_resident'
  | 'transfer_to_human'
  | 'schedule_appointment'
  | 'check_payment_status'
  | 'process_mock_payment';

// ===========================================
// HELPER: Get tool by name
// ===========================================

export function getToolByName(name: GovernmentToolName): Tool | undefined {
  return GOVERNMENT_TOOLS.find((tool) => tool.function.name === name);
}

// ===========================================
// HELPER: Get all tool names
// ===========================================

export function getToolNames(): string[] {
  return GOVERNMENT_TOOLS.map((tool) => tool.function.name);
}

// ===========================================
// SUBSET EXPORTS (for different AI personas)
// ===========================================

// Tools for general city services (311)
export const CITY_SERVICES_TOOLS: Tool[] = GOVERNMENT_TOOLS.filter((tool) =>
  ['lookup_permit', 'log_service_request', 'transfer_to_human'].includes(
    tool.function.name
  )
);

// Tools for transit authority
export const TRANSIT_TOOLS: Tool[] = GOVERNMENT_TOOLS.filter((tool) =>
  ['check_bus_schedule', 'transfer_to_human'].includes(tool.function.name)
);

// Tools for housing authority
export const HOUSING_TOOLS: Tool[] = GOVERNMENT_TOOLS.filter((tool) =>
  ['check_housing_status', 'verify_resident', 'transfer_to_human'].includes(
    tool.function.name
  )
);

// All tools for full-featured demo
export const DEMO_TOOLS: Tool[] = GOVERNMENT_TOOLS;
