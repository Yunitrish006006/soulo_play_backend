import { jsonResponse } from './utils.js';
import {
  asPositiveInteger,
  boolToInt,
  EVENT_STATUS_CLOSED,
  EVENT_STATUS_DRAFT,
  EVENT_STATUS_OPEN,
  invalidBodyResponse,
  normalizeDateOnly,
  normalizeNullableString,
  normalizeSlug,
  normalizeStringArray,
  normalizeTrimmedString,
  parseJsonColumn,
  requireAdminUser
} from './portal_common.js';

const VALID_EVENT_STATUSES = [
  EVENT_STATUS_DRAFT,
  EVENT_STATUS_OPEN,
  EVENT_STATUS_CLOSED
];

function mapEventRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    start_date: row.start_date,
    end_date: row.end_date,
    intro_html: row.intro_html,
    agenda: parseJsonColumn(row.agenda_json, []),
    rules_html: row.rules_html,
    refund_policy_html: row.refund_policy_html,
    packing_required: parseJsonColumn(row.packing_required_json, []),
    packing_recommended: parseJsonColumn(row.packing_recommended_json, []),
    pickup_info: parseJsonColumn(row.pickup_info_json, {}),
    organizer_ig: row.organizer_ig,
    organizer_line_url: row.organizer_line_url,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapPlanRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    event_id: row.event_id,
    code: row.code,
    label: row.label,
    min_people: row.min_people,
    max_people: row.max_people,
    price_per_person: row.price_per_person,
    shuttle_price_per_person: row.shuttle_price_per_person,
    payment_due_days: row.payment_due_days,
    bank_code: row.bank_code,
    bank_account: row.bank_account,
    active: Number(row.active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeEventPayload(body, { requireAll = true } = {}) {
  const title = normalizeTrimmedString(body.title);
  const slug = normalizeSlug(body.slug ?? body.title);
  const startDate = normalizeDateOnly(body.start_date);
  const endDate = normalizeDateOnly(body.end_date);
  const status = normalizeTrimmedString(body.status || EVENT_STATUS_DRAFT);

  if (requireAll) {
    if (!title) return { error: 'title is required' };
    if (!slug) return { error: 'slug is required' };
    if (!startDate) return { error: 'start_date is required' };
    if (!endDate) return { error: 'end_date is required' };
  }

  if (status && !VALID_EVENT_STATUSES.includes(status)) {
    return { error: 'status must be draft, open, or closed' };
  }

  return {
    error: null,
    payload: {
      title,
      slug,
      start_date: startDate,
      end_date: endDate,
      intro_html: normalizeNullableString(body.intro_html),
      agenda_json: JSON.stringify(Array.isArray(body.agenda) ? body.agenda : []),
      rules_html: normalizeNullableString(body.rules_html),
      refund_policy_html: normalizeNullableString(body.refund_policy_html),
      packing_required_json: JSON.stringify(
        normalizeStringArray(body.packing_required)
      ),
      packing_recommended_json: JSON.stringify(
        normalizeStringArray(body.packing_recommended)
      ),
      pickup_info_json: JSON.stringify(
        body.pickup_info && typeof body.pickup_info === 'object'
          ? body.pickup_info
          : {}
      ),
      organizer_ig: normalizeNullableString(body.organizer_ig),
      organizer_line_url: normalizeNullableString(body.organizer_line_url),
      status: status || EVENT_STATUS_DRAFT
    }
  };
}

function normalizePlanPayload(body) {
  const minPeople = asPositiveInteger(body.min_people);
  const maxPeople = asPositiveInteger(body.max_people);
  const pricePerPerson = asPositiveInteger(body.price_per_person);
  const shuttlePricePerPerson = Number(body.shuttle_price_per_person ?? 0);
  const paymentDueDays = asPositiveInteger(body.payment_due_days ?? 3);

  if (!normalizeTrimmedString(body.code)) {
    return { error: 'code is required' };
  }
  if (!normalizeTrimmedString(body.label)) {
    return { error: 'label is required' };
  }
  if (!minPeople || !maxPeople || minPeople > maxPeople) {
    return { error: 'min_people and max_people are invalid' };
  }
  if (!pricePerPerson || !paymentDueDays) {
    return { error: 'price_per_person and payment_due_days are required' };
  }
  if (!Number.isInteger(shuttlePricePerPerson) || shuttlePricePerPerson < 0) {
    return { error: 'shuttle_price_per_person must be a non-negative integer' };
  }

  const bankCode = normalizeTrimmedString(body.bank_code);
  const bankAccount = normalizeTrimmedString(body.bank_account);
  if (!bankCode || !bankAccount) {
    return { error: 'bank_code and bank_account are required' };
  }

  return {
    error: null,
    payload: {
      code: normalizeTrimmedString(body.code),
      label: normalizeTrimmedString(body.label),
      min_people: minPeople,
      max_people: maxPeople,
      price_per_person: pricePerPerson,
      shuttle_price_per_person: shuttlePricePerPerson,
      payment_due_days: paymentDueDays,
      bank_code: bankCode,
      bank_account: bankAccount,
      active: boolToInt(body.active !== false)
    }
  };
}

export async function fetchEventById(env, eventId, { onlyOpen = false } = {}) {
  const clauses = ['id = ?'];
  if (onlyOpen) {
    clauses.push('status = ?');
  }

  const statement = env.DB.prepare(
    `SELECT id, title, slug, start_date, end_date, intro_html, agenda_json,
            rules_html, refund_policy_html, packing_required_json,
            packing_recommended_json, pickup_info_json, organizer_ig,
            organizer_line_url, status, created_at, updated_at
     FROM events
     WHERE ${clauses.join(' AND ')}`
  );
  const bound = onlyOpen
    ? statement.bind(eventId, EVENT_STATUS_OPEN)
    : statement.bind(eventId);
  const row = await bound.first();
  return mapEventRow(row);
}

export async function fetchPlanById(env, planId) {
  const row = await env.DB.prepare(
    `SELECT id, event_id, code, label, min_people, max_people,
            price_per_person, shuttle_price_per_person, payment_due_days,
            bank_code, bank_account, active, created_at, updated_at
     FROM event_plans
     WHERE id = ?`
  )
    .bind(planId)
    .first();

  return mapPlanRow(row);
}

export async function fetchActivePlansForEvent(env, eventId) {
  const result = await env.DB.prepare(
    `SELECT id, event_id, code, label, min_people, max_people,
            price_per_person, shuttle_price_per_person, payment_due_days,
            bank_code, bank_account, active, created_at, updated_at
     FROM event_plans
     WHERE event_id = ? AND active = 1
     ORDER BY min_people ASC, max_people ASC, id ASC`
  )
    .bind(eventId)
    .all();

  return (result.results ?? []).map(mapPlanRow);
}

export async function handleGetOpenEvents(request, env) {
  const result = await env.DB.prepare(
    `SELECT id, title, slug, start_date, end_date, intro_html, agenda_json,
            rules_html, refund_policy_html, packing_required_json,
            packing_recommended_json, pickup_info_json, organizer_ig,
            organizer_line_url, status, created_at, updated_at
     FROM events
     WHERE status = ?
     ORDER BY start_date ASC, id ASC`
  )
    .bind(EVENT_STATUS_OPEN)
    .all();

  return jsonResponse(
    { events: (result.results ?? []).map(mapEventRow) },
    200,
    request
  );
}

export async function handleGetEventById(request, env, eventId) {
  const event = await fetchEventById(env, eventId, { onlyOpen: true });
  if (!event) {
    return jsonResponse({ error: 'Event not found' }, 404, request);
  }

  const plans = await fetchActivePlansForEvent(env, event.id);
  return jsonResponse({ event, plans }, 200, request);
}

export async function handleAdminCreateEvent(request, env) {
  const { error } = await requireAdminUser(request, env);
  if (error) {
    return error;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const normalized = normalizeEventPayload(body);
  if (normalized.error) {
    return jsonResponse({ error: normalized.error }, 400, request);
  }

  const payload = normalized.payload;
  const result = await env.DB.prepare(
    `INSERT INTO events (
       title, slug, start_date, end_date, intro_html, agenda_json,
       rules_html, refund_policy_html, packing_required_json,
       packing_recommended_json, pickup_info_json, organizer_ig,
       organizer_line_url, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      payload.title,
      payload.slug,
      payload.start_date,
      payload.end_date,
      payload.intro_html,
      payload.agenda_json,
      payload.rules_html,
      payload.refund_policy_html,
      payload.packing_required_json,
      payload.packing_recommended_json,
      payload.pickup_info_json,
      payload.organizer_ig,
      payload.organizer_line_url,
      payload.status
    )
    .run();

  const event = await fetchEventById(env, result.meta.last_row_id);
  return jsonResponse({ ok: true, event }, 201, request);
}

export async function handleAdminUpdateEvent(request, env, eventId) {
  const { error } = await requireAdminUser(request, env);
  if (error) {
    return error;
  }

  const existing = await fetchEventById(env, eventId);
  if (!existing) {
    return jsonResponse({ error: 'Event not found' }, 404, request);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const normalized = normalizeEventPayload(
    {
      ...existing,
      ...body,
      agenda: body.agenda ?? existing.agenda,
      packing_required: body.packing_required ?? existing.packing_required,
      packing_recommended:
        body.packing_recommended ?? existing.packing_recommended,
      pickup_info: body.pickup_info ?? existing.pickup_info
    },
    { requireAll: true }
  );
  if (normalized.error) {
    return jsonResponse({ error: normalized.error }, 400, request);
  }

  const payload = normalized.payload;
  await env.DB.prepare(
    `UPDATE events
     SET title = ?, slug = ?, start_date = ?, end_date = ?, intro_html = ?,
         agenda_json = ?, rules_html = ?, refund_policy_html = ?,
         packing_required_json = ?, packing_recommended_json = ?,
         pickup_info_json = ?, organizer_ig = ?, organizer_line_url = ?,
         status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      payload.title,
      payload.slug,
      payload.start_date,
      payload.end_date,
      payload.intro_html,
      payload.agenda_json,
      payload.rules_html,
      payload.refund_policy_html,
      payload.packing_required_json,
      payload.packing_recommended_json,
      payload.pickup_info_json,
      payload.organizer_ig,
      payload.organizer_line_url,
      payload.status,
      eventId
    )
    .run();

  const event = await fetchEventById(env, eventId);
  return jsonResponse({ ok: true, event }, 200, request);
}

export async function handleAdminCreatePlan(request, env, eventId) {
  const { error } = await requireAdminUser(request, env);
  if (error) {
    return error;
  }

  const event = await fetchEventById(env, eventId);
  if (!event) {
    return jsonResponse({ error: 'Event not found' }, 404, request);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const normalized = normalizePlanPayload(body);
  if (normalized.error) {
    return jsonResponse({ error: normalized.error }, 400, request);
  }

  const payload = normalized.payload;
  const result = await env.DB.prepare(
    `INSERT INTO event_plans (
       event_id, code, label, min_people, max_people, price_per_person,
       shuttle_price_per_person, payment_due_days, bank_code, bank_account, active
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      eventId,
      payload.code,
      payload.label,
      payload.min_people,
      payload.max_people,
      payload.price_per_person,
      payload.shuttle_price_per_person,
      payload.payment_due_days,
      payload.bank_code,
      payload.bank_account,
      payload.active
    )
    .run();

  const plan = await fetchPlanById(env, result.meta.last_row_id);
  return jsonResponse({ ok: true, plan }, 201, request);
}

export async function handleAdminUpdatePlan(request, env, planId) {
  const { error } = await requireAdminUser(request, env);
  if (error) {
    return error;
  }

  const existing = await fetchPlanById(env, planId);
  if (!existing) {
    return jsonResponse({ error: 'Plan not found' }, 404, request);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const normalized = normalizePlanPayload({ ...existing, ...body });
  if (normalized.error) {
    return jsonResponse({ error: normalized.error }, 400, request);
  }

  const payload = normalized.payload;
  await env.DB.prepare(
    `UPDATE event_plans
     SET code = ?, label = ?, min_people = ?, max_people = ?,
         price_per_person = ?, shuttle_price_per_person = ?,
         payment_due_days = ?, bank_code = ?, bank_account = ?, active = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      payload.code,
      payload.label,
      payload.min_people,
      payload.max_people,
      payload.price_per_person,
      payload.shuttle_price_per_person,
      payload.payment_due_days,
      payload.bank_code,
      payload.bank_account,
      payload.active,
      planId
    )
    .run();

  const plan = await fetchPlanById(env, planId);
  return jsonResponse({ ok: true, plan }, 200, request);
}
