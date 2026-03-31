import { getUserAvatarImageResponse } from './users.js';
import { jsonResponse } from './utils.js';

function matchUserAvatarPath(pathname) {
  const match = pathname.match(/^\/user-avatars\/(\d+)$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export async function handleMediaRequest(request, env, url) {
  const userAvatarId = matchUserAvatarPath(url.pathname);
  if (userAvatarId && request.method === 'GET') {
    const response = await getUserAvatarImageResponse(env, userAvatarId);
    return response ?? jsonResponse({ error: 'Not Found' }, 404, request);
  }

  return null;
}
