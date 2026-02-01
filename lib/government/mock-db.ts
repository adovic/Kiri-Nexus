// ===========================================
// GOVERNMENT MOCK DATABASE
// ===========================================
// Simulated city database for AI demo purposes
// Contains fake records for permits, transit, housing, and residents

// ===========================================
// TYPE DEFINITIONS
// ===========================================

export interface Permit {
  id: string;
  type: string;
  address: string;
  applicant: string;
  status: 'Approved' | 'Pending' | 'Rejected' | 'Under Review';
  submittedDate: string;
  lastUpdated: string;
  notes?: string;
}

export interface BusRoute {
  routeId: string;
  name: string;
  direction: string;
  nextArrivals: string[];  // Array of times like "3 min", "12 min"
  status: 'On Time' | 'Delayed' | 'Out of Service';
  delayMinutes?: number;
}

export interface HousingApplication {
  applicationId: string;
  applicantName: string;
  phone: string;
  status: 'Active' | 'Inactive' | 'Approved' | 'Expired';
  waitlistPosition: number | null;
  estimatedWait: string;
  programType: string;
  submittedDate: string;
}

export interface Resident {
  id: string;
  name: string;
  phone: string;
  pin: string;
  address: string;
  verified: boolean;
  registeredServices: string[];
}

// ===========================================
// MOCK DATABASE
// ===========================================

export const MOCK_DB = {
  // -----------------------------------------
  // PERMITS
  // -----------------------------------------
  permits: [
    {
      id: 'P-101',
      type: 'Building Permit',
      address: '742 Evergreen Terrace',
      applicant: 'Homer Simpson',
      status: 'Approved',
      submittedDate: '2024-11-15',
      lastUpdated: '2024-12-02',
      notes: 'Approved for residential garage addition. Inspection scheduled.',
    },
    {
      id: 'P-102',
      type: 'Fence Permit',
      address: '1600 Pennsylvania Ave',
      applicant: 'John Smith',
      status: 'Pending',
      submittedDate: '2024-12-20',
      lastUpdated: '2024-12-20',
      notes: 'Awaiting zoning review. Expected decision within 5 business days.',
    },
    {
      id: 'P-103',
      type: 'Demolition Permit',
      address: '221B Baker Street',
      applicant: 'Sarah Watson',
      status: 'Rejected',
      submittedDate: '2024-10-05',
      lastUpdated: '2024-10-28',
      notes: 'Rejected - Property is in historic district. Appeals may be filed within 30 days.',
    },
    {
      id: 'P-104',
      type: 'Electrical Permit',
      address: '350 Fifth Avenue',
      applicant: 'Mike Johnson',
      status: 'Under Review',
      submittedDate: '2024-12-18',
      lastUpdated: '2024-12-22',
      notes: 'Under technical review by electrical inspector.',
    },
    {
      id: 'P-105',
      type: 'Plumbing Permit',
      address: '12 Grimmauld Place',
      applicant: 'Nancy Drew',
      status: 'Approved',
      submittedDate: '2024-11-30',
      lastUpdated: '2024-12-15',
      notes: 'Approved. Work must be completed within 180 days.',
    },
  ] as Permit[],

  // -----------------------------------------
  // BUS ROUTES
  // -----------------------------------------
  busRoutes: [
    {
      routeId: '51B',
      name: 'Downtown Express',
      direction: 'Northbound to City Center',
      nextArrivals: ['3 min', '12 min', '24 min'],
      status: 'On Time',
    },
    {
      routeId: '6',
      name: 'Westside Local',
      direction: 'Westbound to Oak Park',
      nextArrivals: ['7 min', '22 min', '37 min'],
      status: 'On Time',
    },
    {
      routeId: '15',
      name: 'Airport Shuttle',
      direction: 'Eastbound to Regional Airport',
      nextArrivals: ['15 min', '45 min', '75 min'],
      status: 'Delayed',
      delayMinutes: 8,
    },
    {
      routeId: '22',
      name: 'University Line',
      direction: 'Southbound to State University',
      nextArrivals: ['5 min', '20 min', '35 min'],
      status: 'On Time',
    },
    {
      routeId: '9',
      name: 'Riverfront Circulator',
      direction: 'Loop - Clockwise',
      nextArrivals: [],
      status: 'Out of Service',
    },
  ] as BusRoute[],

  // -----------------------------------------
  // HOUSING APPLICATIONS
  // -----------------------------------------
  housingApplications: [
    {
      applicationId: 'HA-990',
      applicantName: 'Maria Garcia',
      phone: '+15551234567',
      status: 'Active',
      waitlistPosition: 47,
      estimatedWait: '8-12 months',
      programType: 'Section 8 Voucher',
      submittedDate: '2024-03-15',
    },
    {
      applicationId: 'HA-991',
      applicantName: 'James Wilson',
      phone: '+15559876543',
      status: 'Active',
      waitlistPosition: 12,
      estimatedWait: '2-4 months',
      programType: 'Public Housing',
      submittedDate: '2023-09-20',
    },
    {
      applicationId: 'HA-992',
      applicantName: 'Linda Chen',
      phone: '+15555550123',
      status: 'Approved',
      waitlistPosition: null,
      estimatedWait: 'N/A - Approved',
      programType: 'Senior Housing',
      submittedDate: '2023-06-01',
    },
    {
      applicationId: 'HA-993',
      applicantName: 'Robert Taylor',
      phone: '+15558765432',
      status: 'Inactive',
      waitlistPosition: null,
      estimatedWait: 'N/A - Inactive',
      programType: 'Section 8 Voucher',
      submittedDate: '2023-01-10',
    },
    {
      applicationId: 'HA-994',
      applicantName: 'Emily Brown',
      phone: '+15551112222',
      status: 'Active',
      waitlistPosition: 156,
      estimatedWait: '18-24 months',
      programType: 'Low-Income Housing',
      submittedDate: '2024-08-05',
    },
  ] as HousingApplication[],

  // -----------------------------------------
  // VERIFIED RESIDENTS
  // -----------------------------------------
  residents: [
    {
      id: 'R-001',
      name: 'John Doe',
      phone: '+15551234567',
      pin: '1234',
      address: '123 Main Street, Apt 4B',
      verified: true,
      registeredServices: ['Trash Pickup', 'Water Utility', 'Newsletter'],
    },
    {
      id: 'R-002',
      name: 'Jane Smith',
      phone: '+15559876543',
      pin: '5678',
      address: '456 Oak Avenue',
      verified: true,
      registeredServices: ['Trash Pickup', 'Recycling', 'Senior Services'],
    },
    {
      id: 'R-003',
      name: 'Robert Johnson',
      phone: '+15555550199',
      pin: '9999',
      address: '789 Elm Street',
      verified: true,
      registeredServices: ['Water Utility', 'Parks & Rec'],
    },
    {
      id: 'R-004',
      name: 'Sarah Williams',
      phone: '+15558881234',
      pin: '4321',
      address: '321 Pine Road',
      verified: true,
      registeredServices: ['Trash Pickup', 'Water Utility', 'Library Card'],
    },
    {
      id: 'R-005',
      name: 'Demo User',
      phone: '+15550000000',
      pin: '0000',
      address: '100 Demo Boulevard',
      verified: true,
      registeredServices: ['All Services'],
    },
  ] as Resident[],
};

// ===========================================
// QUERY HELPER FUNCTIONS
// ===========================================

/**
 * Look up a permit by its ID
 * @param id - Permit ID (e.g., "P-101")
 * @returns Permit object or null if not found
 */
export function getPermitStatus(id: string): Permit | null {
  const normalizedId = id.toUpperCase().trim();
  const permit = MOCK_DB.permits.find(
    (p) => p.id.toUpperCase() === normalizedId
  );
  return permit || null;
}

/**
 * Get next bus arrival times for a route
 * @param routeId - Route ID (e.g., "51B", "6")
 * @returns BusRoute object or null if not found
 */
export function getNextBus(routeId: string): BusRoute | null {
  const normalizedId = routeId.toUpperCase().trim();
  const route = MOCK_DB.busRoutes.find(
    (r) => r.routeId.toUpperCase() === normalizedId
  );
  return route || null;
}

/**
 * Check housing application status by application ID
 * @param appId - Application ID (e.g., "HA-990")
 * @returns HousingApplication object or null if not found
 */
export function getApplicationStatus(appId: string): HousingApplication | null {
  const normalizedId = appId.toUpperCase().trim();
  const application = MOCK_DB.housingApplications.find(
    (a) => a.applicationId.toUpperCase() === normalizedId
  );
  return application || null;
}

/**
 * Verify a resident by phone number and PIN
 * @param phone - Phone number (with or without formatting)
 * @param pin - 4-digit PIN
 * @returns Resident object if verified, null if not found or PIN mismatch
 */
export function verifyResident(phone: string, pin: string): Resident | null {
  // Normalize phone: remove all non-digits, then add +1 prefix if needed
  const normalizedPhone = normalizePhone(phone);
  const normalizedPin = pin.trim();

  const resident = MOCK_DB.residents.find(
    (r) => normalizePhone(r.phone) === normalizedPhone && r.pin === normalizedPin
  );

  return resident && resident.verified ? resident : null;
}

/**
 * Look up a resident by phone number only (no PIN verification)
 * @param phone - Phone number
 * @returns Resident object or null if not found
 */
export function findResidentByPhone(phone: string): Resident | null {
  const normalizedPhone = normalizePhone(phone);
  const resident = MOCK_DB.residents.find(
    (r) => normalizePhone(r.phone) === normalizedPhone
  );
  return resident || null;
}

/**
 * Look up housing application by phone number
 * @param phone - Phone number
 * @returns HousingApplication object or null if not found
 */
export function getApplicationByPhone(phone: string): HousingApplication | null {
  const normalizedPhone = normalizePhone(phone);
  const application = MOCK_DB.housingApplications.find(
    (a) => normalizePhone(a.phone) === normalizedPhone
  );
  return application || null;
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Normalize phone number to E.164 format (+1XXXXXXXXXX)
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If 10 digits, assume US and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If 11 digits starting with 1, add +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Otherwise return as-is with + prefix
  return `+${digits}`;
}

/**
 * Format a phone number for display
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return phone;
}

/**
 * Get all available bus routes (for listing)
 */
export function getAllBusRoutes(): BusRoute[] {
  return MOCK_DB.busRoutes;
}

/**
 * Search permits by address (partial match)
 */
export function searchPermitsByAddress(query: string): Permit[] {
  const normalizedQuery = query.toLowerCase().trim();
  return MOCK_DB.permits.filter((p) =>
    p.address.toLowerCase().includes(normalizedQuery)
  );
}

// ===========================================
// SERVICE REQUEST, SCHEDULING & PAYMENT FUNCTIONS
// ===========================================

/**
 * Create a new 311 service request
 */
export function createServiceRequest(
  issueType: string,
  location: string,
  description?: string
): { id: string; status: string; estimated_resolution: string } {
  const id = 'SR-' + Math.floor(Math.random() * 10000);
  return {
    id,
    status: 'Submitted',
    estimated_resolution: '3-5 business days',
  };
}

/**
 * Schedule an appointment with a city department.
 * Validates business hours: Mon-Fri 8am-5pm only.
 */
export function scheduleAppointment(
  department: string,
  preferredTime: string
): { id?: string; time?: string; department?: string; error?: string } {
  // Parse the time string to validate business hours
  if (preferredTime) {
    const parsed = new Date(preferredTime);
    if (!isNaN(parsed.getTime())) {
      const day = parsed.getDay(); // 0=Sun, 6=Sat
      const hour = parsed.getHours();

      if (day === 0 || day === 6) {
        return { error: 'Error: City Hall is closed on weekends. Please choose Mon-Fri.' };
      }
      if (hour < 8 || hour >= 17) {
        return { error: 'Error: Outside business hours (8am-5pm).' };
      }
    }
  }

  const id = 'APT-' + Math.floor(Math.random() * 10000);
  return {
    id,
    time: preferredTime || 'Next available slot',
    department,
  };
}

/**
 * Check payment status by reference number
 */
export function getPaymentStatus(
  referenceNumber: string
): { status: string; amount: string; date: string } | null {
  // Mock payment records
  const payments: Record<string, { status: string; amount: string; date: string }> = {
    'PAY-123': { status: 'Paid', amount: '$150.00', date: '2024-12-15' },
    'PAY-456': { status: 'Pending', amount: '$75.00', date: '2024-12-20' },
    'CIT-998': { status: 'Unpaid', amount: '$50.00', date: '2024-11-30' },
  };
  return payments[referenceNumber] || null;
}

/**
 * Process a mock payment
 */
export function processPayment(
  amount: number,
  method: string
): { receipt_id: string } {
  return {
    receipt_id: 'REC-' + Math.floor(Math.random() * 100000),
  };
}

