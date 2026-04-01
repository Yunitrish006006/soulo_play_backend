import { handleGoogleLogin, handleLogout, handleMe } from './auth.js';
import {
  handleAdminCreateEvent,
  handleAdminCreatePlan,
  handleAdminUpdateEvent,
  handleAdminUpdatePlan,
  handleGetEventById,
  handleGetOpenEvents
} from './events.js';
import {
  handleGetParticipantProfile,
  handlePutParticipantProfile
} from './participants.js';
import {
  handleAdminListRegistrations,
  handleAdminReviewRegistration,
  handleAdminVerifyPayment,
  handleCreateRegistration,
  handleGetMyRegistrations,
  handleGetRegistrationById,
  handleSubmitPayment
} from './registrations.js';
import {
  handleDeleteAvatarImage,
  handleGetCurrentUser,
  handleUpdateCurrentUser,
  handleUpdateLocale,
  handleUpdateThemeMode,
  handleUpdateUiPreferences,
  handleUploadAvatarImage
} from './users.js';
import { jsonResponse } from './utils.js';

async function handleHealth(request) {
  return jsonResponse({ ok: true, message: 'soulo play api alive' }, 200, request);
}

export async function handleApiRequest(request, env, url) {
  switch (`${request.method} ${url.pathname}`) {
    case 'GET /api/health':
      return handleHealth(request);
    case 'GET /api/participant-profile':
      return handleGetParticipantProfile(request, env);
    case 'PUT /api/participant-profile':
      return handlePutParticipantProfile(request, env);
    case 'GET /api/events/open':
      return handleGetOpenEvents(request, env);
    case 'POST /api/registrations':
      return handleCreateRegistration(request, env);
    case 'GET /api/registrations/me':
      return handleGetMyRegistrations(request, env);
    case 'POST /api/admin/events':
      return handleAdminCreateEvent(request, env);
    case 'GET /api/me':
      return handleMe(request, env);
    case 'GET /api/users/me':
      return handleGetCurrentUser(request, env);
    case 'PUT /api/users/me':
      return handleUpdateCurrentUser(request, env);
    case 'POST /api/users/me/avatar-image':
      return handleUploadAvatarImage(request, env);
    case 'DELETE /api/users/me/avatar-image':
      return handleDeleteAvatarImage(request, env);
    case 'PUT /api/users/theme-mode':
      return handleUpdateThemeMode(request, env);
    case 'PUT /api/users/ui-preferences':
      return handleUpdateUiPreferences(request, env);
    case 'PUT /api/users/locale':
      return handleUpdateLocale(request, env);
    case 'POST /api/logout':
      return handleLogout(request, env);
    case 'POST /api/google-login':
      return handleGoogleLogin(request, env);
  }

  const eventIdMatch = url.pathname.match(/^\/api\/events\/(\d+)$/);
  if (request.method === 'GET' && eventIdMatch) {
    return handleGetEventById(request, env, Number(eventIdMatch[1]));
  }

  const registrationIdMatch = url.pathname.match(/^\/api\/registrations\/(\d+)$/);
  if (request.method === 'GET' && registrationIdMatch) {
    return handleGetRegistrationById(request, env, Number(registrationIdMatch[1]));
  }

  const paymentSubmissionMatch = url.pathname.match(
    /^\/api\/registrations\/(\d+)\/payment-submission$/
  );
  if (request.method === 'POST' && paymentSubmissionMatch) {
    return handleSubmitPayment(request, env, Number(paymentSubmissionMatch[1]));
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/registrations') {
    return handleAdminListRegistrations(request, env, url);
  }

  const adminReviewMatch = url.pathname.match(
    /^\/api\/admin\/registrations\/(\d+)\/review$/
  );
  if (request.method === 'POST' && adminReviewMatch) {
    return handleAdminReviewRegistration(request, env, Number(adminReviewMatch[1]));
  }

  const adminPaymentVerifyMatch = url.pathname.match(
    /^\/api\/admin\/registrations\/(\d+)\/payment-verify$/
  );
  if (request.method === 'POST' && adminPaymentVerifyMatch) {
    return handleAdminVerifyPayment(
      request,
      env,
      Number(adminPaymentVerifyMatch[1])
    );
  }

  const adminEventIdMatch = url.pathname.match(/^\/api\/admin\/events\/(\d+)$/);
  if (request.method === 'PUT' && adminEventIdMatch) {
    return handleAdminUpdateEvent(request, env, Number(adminEventIdMatch[1]));
  }

  const adminEventPlanMatch = url.pathname.match(
    /^\/api\/admin\/events\/(\d+)\/plans$/
  );
  if (request.method === 'POST' && adminEventPlanMatch) {
    return handleAdminCreatePlan(request, env, Number(adminEventPlanMatch[1]));
  }

  const adminPlanIdMatch = url.pathname.match(/^\/api\/admin\/plans\/(\d+)$/);
  if (request.method === 'PUT' && adminPlanIdMatch) {
    return handleAdminUpdatePlan(request, env, Number(adminPlanIdMatch[1]));
  }

  return jsonResponse({ error: 'Not Found' }, 404, request);
}
