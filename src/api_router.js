import { handleGoogleLogin, handleLogout, handleMe } from './auth.js';
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
    default:
      return jsonResponse({ error: 'Not Found' }, 404, request);
  }
}
