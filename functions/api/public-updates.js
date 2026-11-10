
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
      SELECT id, slug, title, summary, content, category, image_url, published_at
      FROM latest_updates
      WHERE status = ?
      ORDER BY published_at DESC, id DESC
      LIMIT 3
    `).bind('published').all();

    const hi=await env.DB.prepare("SELECT content_key,content_value FROM website_content WHERE section_key='updates_hi' AND content_key IN (SELECT slug FROM latest_updates WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT 3)").all();const translations=new Map((hi.results||[]).map(row=>{try{return [row.content_key,JSON.parse(row.content_value)];}catch{return [row.content_key,{}];}}));
    return json({
      success: true,
      updates: (result.results||[]).map(row=>{const value=translations.get(row.slug);return {...row,...Object.fromEntries(['title_hi','summary_hi','content_hi'].map(key=>[key,typeof value?.[key]==='string'?value[key]:'']))};})
    });
  } catch {
    return json({ success: false, error: 'Unable to load updates' }, 500);
  }
}

