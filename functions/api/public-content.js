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

const HERO_KEYS = ['eyebrow', 'heading', 'description'];
const SERVICE_KEYS = [
  'home_loans_title', 'home_loans_description',
  'business_loans_title', 'business_loans_description',
  'mortgage_loans_title', 'mortgage_loans_description',
  'od_cc_title', 'od_cc_description',
  'bg_lrd_title', 'bg_lrd_description',
  'personal_auto_title', 'personal_auto_description'
];

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'Content service unavailable' }, 503);
  try {
    const result = await env.DB.prepare(`
      SELECT section_key, content_key, content_value
      FROM website_content
      WHERE section_key IN ('hero', 'services')
      ORDER BY id
    `).all();
    const content = {};
    const services = {};
    for (const row of result.results ?? []) {
      if (row.section_key === 'hero' && HERO_KEYS.includes(row.content_key)) {
        content[row.content_key] = row.content_value;
      } else if (row.section_key === 'services' && SERVICE_KEYS.includes(row.content_key)) {
        services[row.content_key] = row.content_value;
      }
    }
    // Keep the original hero response shape for existing website consumers.
    return json({ success: true, content, services });
  } catch {
    return json({ error: 'Unable to load website content' }, 500);
  }
}
