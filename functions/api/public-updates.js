
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return json({ success: false, error: 'Updates unavailable' }, 503);
  }

  try {
    const result = await env.DB.prepare(`
      SELECT id, slug, title, summary, category, image_url, published_at
      FROM latest_updates
      WHERE status = ?
      ORDER BY published_at DESC, id DESC
      LIMIT 3
    `).bind('published').all();

    return json({
      success: true,
      updates: result.results ?? []
    });
  } catch {
    return json({ success: false, error: 'Unable to load updates' }, 500);
  }
}
