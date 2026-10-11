export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'RESOLVED',
  'CLOSED',
];

export const STATUS_ALIASES = {
  Open: 'OPEN',
  OPEN: 'OPEN',
  'In Progress': 'IN_PROGRESS',
  IN_PROGRESS: 'IN_PROGRESS',
  'Waiting for customer': 'WAITING_FOR_CUSTOMER',
  'Waiting for Customer': 'WAITING_FOR_CUSTOMER',
  WAITING_FOR_CUSTOMER: 'WAITING_FOR_CUSTOMER',
  Resolved: 'RESOLVED',
  RESOLVED: 'RESOLVED',
  Closed: 'CLOSED',
  CLOSED: 'CLOSED',
};

export const STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_CUSTOMER: 'Waiting for customer',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const TICKET_PRIORITIES = ['Low', 'Medium', 'High'];

export const TICKET_CATEGORIES = [
  'Login problem',
  'Payment problem',
  'Product bug',
  'Account access',
  'Billing',
  'Other',
];

export const MESSAGE_VISIBILITY = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
};

export const HISTORY_ACTIONS = {
  CREATED: 'CREATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  ASSIGNED: 'ASSIGNED',
  REPLY_ADDED: 'REPLY_ADDED',
  RESOLVED: 'RESOLVED',
};

const ALLOWED_TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED', 'OPEN'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export function normalizeStatus(value) {
  if (typeof value !== 'string') return null;
  return STATUS_ALIASES[value] || STATUS_ALIASES[value.trim()] || null;
}

export function canTransition(from, to) {
  const current = normalizeStatus(from);
  const next = normalizeStatus(to);
  if (!current || !next) return false;
  if (current === next) return true;
  return ALLOWED_TRANSITIONS[current]?.includes(next) === true;
}
