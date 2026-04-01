import { ROLE_ADMIN, normalizeRole } from './permissions.js';
import { getCurrentUser, jsonResponse } from './utils.js';

export const EVENT_STATUS_DRAFT = 'draft';
export const EVENT_STATUS_OPEN = 'open';
export const EVENT_STATUS_CLOSED = 'closed';

export const REGISTRATION_STATUS_SUBMITTED = 'submitted';
export const REGISTRATION_STATUS_PAYMENT_PENDING = 'payment_pending';
export const REGISTRATION_STATUS_PAYMENT_SUBMITTED = 'payment_submitted';
export const REGISTRATION_STATUS_PAID = 'paid';
export const REGISTRATION_STATUS_REJECTED = 'rejected';
export const REGISTRATION_STATUS_CANCELLED = 'cancelled';

export const REVIEW_STATUS_PENDING = 'pending';
export const REVIEW_STATUS_APPROVED = 'approved';
export const REVIEW_STATUS_REJECTED = 'rejected';

export const PAYMENT_STATUS_SUBMITTED = 'submitted';
export const PAYMENT_STATUS_CONFIRMED = 'confirmed';
export const PAYMENT_STATUS_REJECTED = 'rejected';

export function parseJsonColumn(value, fallback) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

export function normalizeTrimmedString(value) {
  return String(value ?? '').trim();
}

export function normalizeNullableString(value) {
  const normalized = normalizeTrimmedString(value);
  return normalized.length === 0 ? null : normalized;
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeTrimmedString(item))
    .filter((item) => item.length > 0);
}

export function boolToInt(value) {
  return value ? 1 : 0;
}

export function intToBool(value) {
  return Number(value) === 1;
}

export function asPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function normalizeSlug(value) {
  const normalized = normalizeTrimmedString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || null;
}

export function normalizeDateOnly(value) {
  const normalized = normalizeTrimmedString(value).replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function plusDaysIso(days) {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export async function requireCurrentUser(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) {
    return {
      error: jsonResponse({ error: 'Not logged in' }, 401, request),
      user: null
    };
  }

  return { error: null, user };
}

export async function requireAdminUser(request, env) {
  const { error, user } = await requireCurrentUser(request, env);
  if (error) {
    return { error, user: null };
  }

  if (normalizeRole(user.role) !== ROLE_ADMIN) {
    return {
      error: jsonResponse({ error: 'Admin only' }, 403, request),
      user: null
    };
  }

  return { error: null, user };
}

export function invalidBodyResponse(request, detail = 'Invalid body') {
  return jsonResponse({ error: detail }, 400, request);
}

export function methodNotAllowedResponse(request) {
  return jsonResponse({ error: 'Method not allowed' }, 405, request);
}
