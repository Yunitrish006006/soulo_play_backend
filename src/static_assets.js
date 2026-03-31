import { jsonResponse } from './utils.js';

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8'
};

function extensionFor(pathname) {
  const normalized = pathname.toLowerCase();
  const match = normalized.match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

function hasFileExtension(pathname) {
  return extensionFor(pathname) !== '';
}

function contentTypeFor(pathname) {
  const extension = extensionFor(pathname);
  return CONTENT_TYPES[extension] || 'application/octet-stream';
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function normalizePathname(pathname) {
  const decoded = decodeURIComponent(pathname);
  return decoded.replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildAssetKeys(pathname) {
  const normalized = normalizePathname(pathname);
  if (!normalized) {
    return ['index.html'];
  }

  const keys = [normalized];
  if (!hasFileExtension(normalized)) {
    keys.push(`${normalized}/index.html`, 'index.html');
  }
  return [...new Set(keys)];
}

async function getAssetRecord(env, key) {
  const raw = await env.STATIC_ASSETS.get(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function assetBodyFromRecord(record) {
  if (record.encoding === 'base64') {
    return base64ToArrayBuffer(record.body || '');
  }
  return record.body || '';
}

function assetHeadersFor(key, record) {
  const headers = new Headers();
  headers.set('content-type', record.contentType || contentTypeFor(key));
  headers.set(
    'cache-control',
    record.cacheControl ||
      (key === 'index.html' || key.endsWith('.html')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable')
  );
  return headers;
}

export async function serveStaticAsset(request, env) {
  if (!env.STATIC_ASSETS) {
    return jsonResponse(
      { ok: false, error: 'missing_static_assets_binding' },
      500,
      request
    );
  }

  const { pathname } = new URL(request.url);
  const candidateKeys = buildAssetKeys(pathname);

  for (const key of candidateKeys) {
    const record = await getAssetRecord(env, key);
    if (!record) {
      continue;
    }

    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: assetHeadersFor(key, record)
      });
    }

    return new Response(assetBodyFromRecord(record), {
      status: 200,
      headers: assetHeadersFor(key, record)
    });
  }

  return new Response('Not Found', { status: 404 });
}
