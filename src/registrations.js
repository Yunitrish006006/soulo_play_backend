import { fetchEventById, fetchPlanById } from './events.js';
import {
  fetchParticipantProfileByUserId,
  upsertParticipantProfile
} from './participants.js';
import { jsonResponse } from './utils.js';
import {
  asPositiveInteger,
  boolToInt,
  intToBool,
  invalidBodyResponse,
  normalizeTrimmedString,
  parseJsonColumn,
  PAYMENT_STATUS_CONFIRMED,
  PAYMENT_STATUS_REJECTED,
  PAYMENT_STATUS_SUBMITTED,
  plusDaysIso,
  REGISTRATION_STATUS_PAID,
  REGISTRATION_STATUS_PAYMENT_PENDING,
  REGISTRATION_STATUS_PAYMENT_SUBMITTED,
  REGISTRATION_STATUS_REJECTED,
  REGISTRATION_STATUS_SUBMITTED,
  requireAdminUser,
  requireCurrentUser,
  REVIEW_STATUS_APPROVED,
  REVIEW_STATUS_PENDING,
  REVIEW_STATUS_REJECTED
} from './portal_common.js';

function mapSnapshotRow(row) {
  if (!row) {
    return null;
  }

  return {
    registration_id: row.registration_id,
    legal_name: row.legal_name,
    gender: row.gender,
    age_range: row.age_range,
    phone: row.phone,
    occupation: row.occupation,
    birth_date: row.birth_date,
    national_id: row.national_id,
    emergency_name: row.emergency_name,
    emergency_relation: row.emergency_relation,
    emergency_phone: row.emergency_phone,
    ig_handle: row.ig_handle,
    line_id: row.line_id,
    nickname: row.nickname,
    city: row.city,
    diet_type: row.diet_type,
    food_avoidances: parseJsonColumn(row.food_avoidances_json, []),
    allergies_text: row.allergies_text,
    music_preferences: parseJsonColumn(row.music_preferences_json, []),
    hobbies_text: row.hobbies_text,
    referral_source: row.referral_source,
    created_at: row.created_at
  };
}

function mapPaymentSubmissionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    registration_id: row.registration_id,
    payer_name: row.payer_name,
    bank_last5: row.bank_last5,
    submitted_amount: row.submitted_amount,
    status: row.status,
    admin_note: row.admin_note,
    submitted_at: row.submitted_at,
    verified_at: row.verified_at
  };
}

function calculateAmountDue(plan, groupSize, shuttleRequired) {
  const registrationAmount = plan.price_per_person * groupSize;
  const shuttleAmount = shuttleRequired
    ? plan.shuttle_price_per_person * groupSize
    : 0;
  return registrationAmount + shuttleAmount;
}

function validateRegistrationBody(body) {
  const eventId = asPositiveInteger(body.event_id);
  const planId = asPositiveInteger(body.plan_id);
  const groupSize = asPositiveInteger(body.group_size);
  const arrivalMode = normalizeTrimmedString(body.arrival_mode);
  const shuttleRequired = Boolean(body.shuttle_required);
  const memberNames = Array.isArray(body.member_names)
    ? body.member_names
        .map((item) => normalizeTrimmedString(item))
        .filter((item) => item.length > 0)
    : [];
  const accepted = body.agreements?.accepted === true;

  if (!eventId || !planId || !groupSize || !arrivalMode) {
    return { error: 'event_id, plan_id, group_size, and arrival_mode are required' };
  }
  if (!accepted) {
    return { error: 'agreements.accepted must be true' };
  }
  if (!body.participant_profile || typeof body.participant_profile !== 'object') {
    return { error: 'participant_profile is required' };
  }

  return {
    error: null,
    payload: {
      event_id: eventId,
      plan_id: planId,
      group_size: groupSize,
      arrival_mode: arrivalMode,
      shuttle_required: shuttleRequired,
      member_names: memberNames,
      participant_profile: body.participant_profile
    }
  };
}

async function fetchRegistrationRowById(env, registrationId) {
  return env.DB.prepare(
    `SELECT r.id, r.event_id, r.user_id, r.plan_id, r.status, r.review_status,
            r.group_size, r.arrival_mode, r.shuttle_required, r.amount_due,
            r.review_note, r.payment_due_at, r.submitted_at, r.approved_at,
            r.paid_at, r.created_at, r.updated_at,
            e.title AS event_title, e.slug AS event_slug,
            e.start_date AS event_start_date, e.end_date AS event_end_date,
            p.code AS plan_code, p.label AS plan_label,
            p.min_people AS plan_min_people, p.max_people AS plan_max_people,
            p.price_per_person, p.shuttle_price_per_person, p.payment_due_days,
            p.bank_code, p.bank_account,
            u.email AS user_email, u.name AS user_name
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     JOIN event_plans p ON p.id = r.plan_id
     JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`
  )
    .bind(registrationId)
    .first();
}

async function fetchRegistrationMembers(env, registrationId) {
  const result = await env.DB.prepare(
    `SELECT id, registration_id, member_name, sort_order
     FROM registration_members
     WHERE registration_id = ?
     ORDER BY sort_order ASC, id ASC`
  )
    .bind(registrationId)
    .all();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    registration_id: row.registration_id,
    member_name: row.member_name,
    sort_order: row.sort_order
  }));
}

async function fetchRegistrationSnapshot(env, registrationId) {
  const row = await env.DB.prepare(
    `SELECT registration_id, legal_name, gender, age_range, phone, occupation,
            birth_date, national_id, emergency_name, emergency_relation,
            emergency_phone, ig_handle, line_id, nickname, city, diet_type,
            food_avoidances_json, allergies_text, music_preferences_json,
            hobbies_text, referral_source, created_at
     FROM registration_profile_snapshots
     WHERE registration_id = ?`
  )
    .bind(registrationId)
    .first();
  return mapSnapshotRow(row);
}

async function fetchLatestPaymentSubmission(env, registrationId) {
  const row = await env.DB.prepare(
    `SELECT id, registration_id, payer_name, bank_last5, submitted_amount,
            status, admin_note, submitted_at, verified_at
     FROM payment_submissions
     WHERE registration_id = ?
     ORDER BY id DESC
     LIMIT 1`
  )
    .bind(registrationId)
    .first();
  return mapPaymentSubmissionRow(row);
}

function canShowPaymentInstructions(status) {
  return [
    REGISTRATION_STATUS_PAYMENT_PENDING,
    REGISTRATION_STATUS_PAYMENT_SUBMITTED,
    REGISTRATION_STATUS_PAID
  ].includes(status);
}

async function buildRegistrationResponse(env, row) {
  const members = await fetchRegistrationMembers(env, row.id);
  const profile_snapshot = await fetchRegistrationSnapshot(env, row.id);
  const payment_submission = await fetchLatestPaymentSubmission(env, row.id);

  return {
    id: row.id,
    event_id: row.event_id,
    user_id: row.user_id,
    plan_id: row.plan_id,
    status: row.status,
    review_status: row.review_status,
    group_size: row.group_size,
    arrival_mode: row.arrival_mode,
    shuttle_required: intToBool(row.shuttle_required),
    amount_due: row.amount_due,
    review_note: row.review_note,
    payment_due_at: row.payment_due_at,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at,
    paid_at: row.paid_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    event: {
      id: row.event_id,
      title: row.event_title,
      slug: row.event_slug,
      start_date: row.event_start_date,
      end_date: row.event_end_date
    },
    plan: {
      id: row.plan_id,
      code: row.plan_code,
      label: row.plan_label,
      min_people: row.plan_min_people,
      max_people: row.plan_max_people,
      price_per_person: row.price_per_person,
      shuttle_price_per_person: row.shuttle_price_per_person,
      payment_due_days: row.payment_due_days
    },
    payment_instructions: canShowPaymentInstructions(row.status)
        ? {
            bank_code: row.bank_code,
            bank_account: row.bank_account
          }
        : null,
    members,
    profile_snapshot,
    payment_submission
  };
}

async function insertRegistrationSnapshot(env, registrationId, profile) {
  await env.DB.prepare(
    `INSERT INTO registration_profile_snapshots (
       registration_id, legal_name, gender, age_range, phone, occupation,
       birth_date, national_id, emergency_name, emergency_relation,
       emergency_phone, ig_handle, line_id, nickname, city, diet_type,
       food_avoidances_json, allergies_text, music_preferences_json,
       hobbies_text, referral_source
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      registrationId,
      profile.legal_name,
      profile.gender,
      profile.age_range,
      profile.phone,
      profile.occupation,
      profile.birth_date,
      profile.national_id,
      profile.emergency_name,
      profile.emergency_relation,
      profile.emergency_phone,
      profile.ig_handle,
      profile.line_id,
      profile.nickname,
      profile.city,
      profile.diet_type,
      JSON.stringify(profile.food_avoidances),
      profile.allergies_text,
      JSON.stringify(profile.music_preferences),
      profile.hobbies_text,
      profile.referral_source
    )
    .run();
}

async function assertOwnRegistration(request, env, registrationId, userId) {
  const row = await fetchRegistrationRowById(env, registrationId);
  if (!row) {
    return {
      error: jsonResponse({ error: 'Registration not found' }, 404, request),
      row: null
    };
  }
  if (row.user_id !== userId) {
    return {
      error: jsonResponse({ error: 'Registration not found' }, 404, request),
      row: null
    };
  }
  return { error: null, row };
}

export async function handleCreateRegistration(request, env) {
  const { error, user } = await requireCurrentUser(request, env);
  if (error) {
    return error;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const normalized = validateRegistrationBody(body);
  if (normalized.error) {
    return jsonResponse({ error: normalized.error }, 400, request);
  }

  const payload = normalized.payload;
  const event = await fetchEventById(env, payload.event_id, { onlyOpen: true });
  if (!event) {
    return jsonResponse({ error: 'Event not found or not open' }, 404, request);
  }

  const plan = await fetchPlanById(env, payload.plan_id);
  if (!plan || plan.event_id !== event.id || !plan.active) {
    return jsonResponse({ error: 'Plan not found' }, 404, request);
  }

  if (
    payload.group_size < plan.min_people ||
    payload.group_size > plan.max_people
  ) {
    return jsonResponse(
      { error: 'group_size does not match the selected plan' },
      400,
      request
    );
  }

  if (payload.member_names.length != payload.group_size - 1) {
    return jsonResponse(
      { error: 'member_names must contain group_size - 1 entries' },
      400,
      request
    );
  }

  const profileResult = await upsertParticipantProfile(
    env,
    user.id,
    payload.participant_profile
  );
  if (profileResult.error) {
    return jsonResponse({ error: profileResult.error }, 400, request);
  }

  let registrationId;
  try {
    const insertResult = await env.DB.prepare(
      `INSERT INTO registrations (
         event_id, user_id, plan_id, status, review_status, group_size,
         arrival_mode, shuttle_required
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        event.id,
        user.id,
        plan.id,
        REGISTRATION_STATUS_SUBMITTED,
        REVIEW_STATUS_PENDING,
        payload.group_size,
        payload.arrival_mode,
        boolToInt(payload.shuttle_required)
      )
      .run();

    registrationId = insertResult.meta.last_row_id;
  } catch (dbError) {
    if (String(dbError.message ?? '').includes('idx_registrations_one_active_per_user_event')) {
      return jsonResponse(
        { error: 'You already have an active registration for this event' },
        409,
        request
      );
    }
    throw dbError;
  }

  for (let index = 0; index < payload.member_names.length; index += 1) {
    await env.DB.prepare(
      `INSERT INTO registration_members (registration_id, member_name, sort_order)
       VALUES (?, ?, ?)`
    )
      .bind(registrationId, payload.member_names[index], index + 1)
      .run();
  }

  await insertRegistrationSnapshot(env, registrationId, profileResult.profile);

  const row = await fetchRegistrationRowById(env, registrationId);
  const registration = await buildRegistrationResponse(env, row);
  return jsonResponse({ ok: true, registration }, 201, request);
}

export async function handleGetMyRegistrations(request, env) {
  const { error, user } = await requireCurrentUser(request, env);
  if (error) {
    return error;
  }

  const result = await env.DB.prepare(
    `SELECT r.id, r.event_id, r.user_id, r.plan_id, r.status, r.review_status,
            r.group_size, r.arrival_mode, r.shuttle_required, r.amount_due,
            r.review_note, r.payment_due_at, r.submitted_at, r.approved_at,
            r.paid_at, r.created_at, r.updated_at,
            e.title AS event_title, e.slug AS event_slug,
            e.start_date AS event_start_date, e.end_date AS event_end_date,
            p.code AS plan_code, p.label AS plan_label,
            p.min_people AS plan_min_people, p.max_people AS plan_max_people,
            p.price_per_person, p.shuttle_price_per_person, p.payment_due_days,
            p.bank_code, p.bank_account,
            u.email AS user_email, u.name AS user_name
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     JOIN event_plans p ON p.id = r.plan_id
     JOIN users u ON u.id = r.user_id
     WHERE r.user_id = ?
     ORDER BY r.created_at DESC, r.id DESC`
  )
    .bind(user.id)
    .all();

  const registrations = [];
  for (const row of result.results ?? []) {
    registrations.push(await buildRegistrationResponse(env, row));
  }

  return jsonResponse({ registrations }, 200, request);
}

export async function handleGetRegistrationById(request, env, registrationId) {
  const { error, user } = await requireCurrentUser(request, env);
  if (error) {
    return error;
  }

  const lookup = await assertOwnRegistration(request, env, registrationId, user.id);
  if (lookup.error) {
    return lookup.error;
  }

  const registration = await buildRegistrationResponse(env, lookup.row);
  return jsonResponse({ registration }, 200, request);
}

export async function handleSubmitPayment(request, env, registrationId) {
  const { error, user } = await requireCurrentUser(request, env);
  if (error) {
    return error;
  }

  const lookup = await assertOwnRegistration(request, env, registrationId, user.id);
  if (lookup.error) {
    return lookup.error;
  }

  if (lookup.row.status !== REGISTRATION_STATUS_PAYMENT_PENDING) {
    return jsonResponse(
      { error: 'Payment submission is not available for this registration' },
      409,
      request
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const payerName = normalizeTrimmedString(body.payer_name);
  const bankLast5 = normalizeTrimmedString(body.bank_last5);
  const submittedAmount = asPositiveInteger(body.submitted_amount);
  if (!payerName || !/^\d{5}$/.test(bankLast5) || !submittedAmount) {
    return jsonResponse(
      {
        error:
          'payer_name, bank_last5 (5 digits), and submitted_amount are required'
      },
      400,
      request
    );
  }

  const paymentResult = await env.DB.prepare(
    `INSERT INTO payment_submissions (
       registration_id, payer_name, bank_last5, submitted_amount, status
     ) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      registrationId,
      payerName,
      bankLast5,
      submittedAmount,
      PAYMENT_STATUS_SUBMITTED
    )
    .run();

  await env.DB.prepare(
    `UPDATE registrations
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(REGISTRATION_STATUS_PAYMENT_SUBMITTED, registrationId)
    .run();

  const row = await fetchRegistrationRowById(env, registrationId);
  const registration = await buildRegistrationResponse(env, row);
  const payment_submission = await fetchLatestPaymentSubmission(env, registrationId);
  return jsonResponse(
    {
      ok: true,
      payment_submission: payment_submission ?? {
        id: paymentResult.meta.last_row_id
      },
      registration
    },
    200,
    request
  );
}

export async function handleAdminListRegistrations(request, env, url) {
  const { error } = await requireAdminUser(request, env);
  if (error) {
    return error;
  }

  const status = normalizeTrimmedString(url.searchParams.get('status'));
  const eventId = asPositiveInteger(url.searchParams.get('event_id'));
  const clauses = [];
  const params = [];

  if (status) {
    clauses.push('r.status = ?');
    params.push(status);
  }
  if (eventId) {
    clauses.push('r.event_id = ?');
    params.push(eventId);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const statement = env.DB.prepare(
    `SELECT r.id, r.event_id, r.user_id, r.plan_id, r.status, r.review_status,
            r.group_size, r.arrival_mode, r.shuttle_required, r.amount_due,
            r.review_note, r.payment_due_at, r.submitted_at, r.approved_at,
            r.paid_at, r.created_at, r.updated_at,
            e.title AS event_title, e.slug AS event_slug,
            e.start_date AS event_start_date, e.end_date AS event_end_date,
            p.code AS plan_code, p.label AS plan_label,
            p.min_people AS plan_min_people, p.max_people AS plan_max_people,
            p.price_per_person, p.shuttle_price_per_person, p.payment_due_days,
            p.bank_code, p.bank_account,
            u.email AS user_email, u.name AS user_name
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     JOIN event_plans p ON p.id = r.plan_id
     JOIN users u ON u.id = r.user_id
     ${whereClause}
     ORDER BY r.created_at DESC, r.id DESC`
  );
  const result = await statement.bind(...params).all();

  const registrations = [];
  for (const row of result.results ?? []) {
    const registration = await buildRegistrationResponse(env, row);
    registrations.push({
      ...registration,
      user: {
        id: row.user_id,
        email: row.user_email,
        name: row.user_name
      }
    });
  }

  return jsonResponse({ registrations }, 200, request);
}

export async function handleAdminReviewRegistration(
  request,
  env,
  registrationId
) {
  const { error } = await requireAdminUser(request, env);
  if (error) {
    return error;
  }

  const row = await fetchRegistrationRowById(env, registrationId);
  if (!row) {
    return jsonResponse({ error: 'Registration not found' }, 404, request);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const action = normalizeTrimmedString(body.action);
  const note = normalizeTrimmedString(body.note);
  if (!['approve', 'reject'].includes(action)) {
    return jsonResponse({ error: 'action must be approve or reject' }, 400, request);
  }

  if (action === 'approve') {
    if (
      ![REGISTRATION_STATUS_SUBMITTED, REGISTRATION_STATUS_REJECTED].includes(
        row.status
      )
    ) {
      return jsonResponse(
        { error: 'Only submitted or rejected registrations can be approved' },
        409,
        request
      );
    }

    const amountDue = calculateAmountDue(
      {
        price_per_person: row.price_per_person,
        shuttle_price_per_person: row.shuttle_price_per_person,
        payment_due_days: row.payment_due_days
      },
      row.group_size,
      intToBool(row.shuttle_required)
    );

    await env.DB.prepare(
      `UPDATE registrations
       SET status = ?, review_status = ?, amount_due = ?, review_note = ?,
           payment_due_at = ?, approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
        REGISTRATION_STATUS_PAYMENT_PENDING,
        REVIEW_STATUS_APPROVED,
        amountDue,
        note || null,
        plusDaysIso(row.payment_due_days),
        registrationId
      )
      .run();
  } else {
    if (row.status === REGISTRATION_STATUS_PAID) {
      return jsonResponse(
        { error: 'Paid registrations cannot be rejected' },
        409,
        request
      );
    }

    await env.DB.prepare(
      `UPDATE registrations
       SET status = ?, review_status = ?, review_note = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
        REGISTRATION_STATUS_REJECTED,
        REVIEW_STATUS_REJECTED,
        note || null,
        registrationId
      )
      .run();
  }

  const nextRow = await fetchRegistrationRowById(env, registrationId);
  const registration = await buildRegistrationResponse(env, nextRow);
  return jsonResponse({ ok: true, registration }, 200, request);
}

export async function handleAdminVerifyPayment(request, env, registrationId) {
  const { error } = await requireAdminUser(request, env);
  if (error) {
    return error;
  }

  const row = await fetchRegistrationRowById(env, registrationId);
  if (!row) {
    return jsonResponse({ error: 'Registration not found' }, 404, request);
  }
  if (row.status !== REGISTRATION_STATUS_PAYMENT_SUBMITTED) {
    return jsonResponse(
      { error: 'Registration is not waiting for payment review' },
      409,
      request
    );
  }

  const latestPayment = await fetchLatestPaymentSubmission(env, registrationId);
  if (!latestPayment || latestPayment.status !== PAYMENT_STATUS_SUBMITTED) {
    return jsonResponse(
      { error: 'No pending payment submission found' },
      404,
      request
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const action = normalizeTrimmedString(body.action);
  const note = normalizeTrimmedString(body.note);
  if (!['confirm', 'reject'].includes(action)) {
    return jsonResponse({ error: 'action must be confirm or reject' }, 400, request);
  }

  if (action === 'confirm') {
    await env.DB.prepare(
      `UPDATE payment_submissions
       SET status = ?, admin_note = ?, verified_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(PAYMENT_STATUS_CONFIRMED, note || null, latestPayment.id)
      .run();

    await env.DB.prepare(
      `UPDATE registrations
       SET status = ?, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(REGISTRATION_STATUS_PAID, registrationId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE payment_submissions
       SET status = ?, admin_note = ?, verified_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(PAYMENT_STATUS_REJECTED, note || null, latestPayment.id)
      .run();

    await env.DB.prepare(
      `UPDATE registrations
       SET status = ?, review_note = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(REGISTRATION_STATUS_PAYMENT_PENDING, note || null, registrationId)
      .run();
  }

  const nextRow = await fetchRegistrationRowById(env, registrationId);
  const registration = await buildRegistrationResponse(env, nextRow);
  return jsonResponse({ ok: true, registration }, 200, request);
}
