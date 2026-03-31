import { handleApiRequest } from './api_router.js';
import { handleMediaRequest } from './media_api.js';
import { serveStaticAsset } from './static_assets.js';
import { corsHeaders, jsonResponse } from './utils.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const mediaResponse = await handleMediaRequest(request, env, url);
    if (mediaResponse) {
      return mediaResponse;
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApiRequest(request, env, url);
      } catch (error) {
        return jsonResponse(
          { error: 'Internal server error', detail: error.message },
          500,
          request
        );
      }
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    return serveStaticAsset(request, env);
  }
};
