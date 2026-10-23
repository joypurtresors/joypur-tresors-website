
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

const ALLOWED_KEYS = [
  'eyebrow',
  'heading',
  'description'
];

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return json({ error: 'Content service unavailable' }, 503);
  }

  try {
    const result = await env.DB.prepare(`
      SELECT content_key, content_value
      FROM website_content
      WHERE section_key = ?
        AND content_key IN (?, ?, ?)
      ORDER BY id
    `).bind('hero', ...ALLOWED_KEYS).all();

    const content = {};

    for (const row of result.results ?? []) {
      if (ALLOWED_KEYS.includes(row.content_key)) {
        content[row.content_key] = row.content_value;
      }
    }

    return json({
      success: true,
      content
    });
  } catch {
    return json({ error: 'Unable to load website content' }, 500);
  }
}

