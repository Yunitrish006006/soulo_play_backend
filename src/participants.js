import { jsonResponse } from './utils.js';
import {
  invalidBodyResponse,
  normalizeDateOnly,
  normalizeNullableString,
  normalizeStringArray,
  normalizeTrimmedString,
  parseJsonColumn,
  requireCurrentUser
} from './portal_common.js';

const PROFILE_REQUIRED_FIELDS = [
  'legal_name',
  'gender',
  'age_range',
  'phone',
  'occupation',
  'birth_date',
  'national_id',
  'emergency_name',
  'emergency_relation',
  'emergency_phone',
  'ig_handle',
  'line_id',
  'diet_type',
  'referral_source'
];

function mapParticipantProfileRow(row) {
  if (!row) {
    return null;
  }

  return {
    user_id: row.user_id,
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
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function fetchParticipantProfileByUserId(env, userId) {
  const row = await env.DB.prepare(
    `SELECT user_id, legal_name, gender, age_range, phone, occupation,
            birth_date, national_id, emergency_name, emergency_relation,
            emergency_phone, ig_handle, line_id, nickname, city, diet_type,
            food_avoidances_json, allergies_text, music_preferences_json,
            hobbies_text, referral_source, created_at, updated_at
     FROM participant_profiles
     WHERE user_id = ?`
  )
    .bind(userId)
    .first();

  return mapParticipantProfileRow(row);
}

function validateAndNormalizeProfile(input) {
  const profile = {
    legal_name: normalizeTrimmedString(input.legal_name),
    gender: normalizeTrimmedString(input.gender),
    age_range: normalizeTrimmedString(input.age_range),
    phone: normalizeTrimmedString(input.phone),
    occupation: normalizeTrimmedString(input.occupation),
    birth_date: normalizeDateOnly(input.birth_date),
    national_id: normalizeTrimmedString(input.national_id),
    emergency_name: normalizeTrimmedString(input.emergency_name),
    emergency_relation: normalizeTrimmedString(input.emergency_relation),
    emergency_phone: normalizeTrimmedString(input.emergency_phone),
    ig_handle: normalizeTrimmedString(input.ig_handle),
    line_id: normalizeTrimmedString(input.line_id),
    nickname: normalizeNullableString(input.nickname),
    city: normalizeNullableString(input.city),
    diet_type: normalizeTrimmedString(input.diet_type),
    food_avoidances: normalizeStringArray(input.food_avoidances),
    allergies_text: normalizeNullableString(input.allergies_text),
    music_preferences: normalizeStringArray(input.music_preferences),
    hobbies_text: normalizeNullableString(input.hobbies_text),
    referral_source: normalizeTrimmedString(input.referral_source)
  };

  if (!profile.birth_date) {
    return {
      error: 'birth_date must use YYYY-MM-DD or YYYY/MM/DD format',
      profile: null
    };
  }

  for (const field of PROFILE_REQUIRED_FIELDS) {
    if (!profile[field]) {
      return {
        error: `${field} is required`,
        profile: null
      };
    }
  }

  return { error: null, profile };
}

export function normalizeParticipantProfileInput(input) {
  return validateAndNormalizeProfile(input);
}

export async function upsertParticipantProfile(env, userId, input) {
  const { error, profile } = validateAndNormalizeProfile(input);
  if (error) {
    return { error, profile: null };
  }

  await env.DB.prepare(
    `INSERT INTO participant_profiles (
       user_id, legal_name, gender, age_range, phone, occupation,
       birth_date, national_id, emergency_name, emergency_relation,
       emergency_phone, ig_handle, line_id, nickname, city, diet_type,
       food_avoidances_json, allergies_text, music_preferences_json,
       hobbies_text, referral_source
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       legal_name = excluded.legal_name,
       gender = excluded.gender,
       age_range = excluded.age_range,
       phone = excluded.phone,
       occupation = excluded.occupation,
       birth_date = excluded.birth_date,
       national_id = excluded.national_id,
       emergency_name = excluded.emergency_name,
       emergency_relation = excluded.emergency_relation,
       emergency_phone = excluded.emergency_phone,
       ig_handle = excluded.ig_handle,
       line_id = excluded.line_id,
       nickname = excluded.nickname,
       city = excluded.city,
       diet_type = excluded.diet_type,
       food_avoidances_json = excluded.food_avoidances_json,
       allergies_text = excluded.allergies_text,
       music_preferences_json = excluded.music_preferences_json,
       hobbies_text = excluded.hobbies_text,
       referral_source = excluded.referral_source,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(
      userId,
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

  return {
    error: null,
    profile: await fetchParticipantProfileByUserId(env, userId)
  };
}

export async function handleGetParticipantProfile(request, env) {
  const { error, user } = await requireCurrentUser(request, env);
  if (error) {
    return error;
  }

  const profile = await fetchParticipantProfileByUserId(env, user.id);
  return jsonResponse({ profile }, 200, request);
}

export async function handlePutParticipantProfile(request, env) {
  const { error, user } = await requireCurrentUser(request, env);
  if (error) {
    return error;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return invalidBodyResponse(request);
  }

  const result = await upsertParticipantProfile(env, user.id, body);
  if (result.error) {
    return jsonResponse({ error: result.error }, 400, request);
  }

  return jsonResponse({ ok: true, profile: result.profile }, 200, request);
}
