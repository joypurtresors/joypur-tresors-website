
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

async function hashToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({
      success: false,
      error: "Service unavailable"
    }, 503);
  }

  const url = new URL(request.url);

  if (request.headers.get("Origin") !== url.origin) {
    return json({
      success: false,
      error: "Forbidden origin"
    }, 403);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid request"
    }, 400);
  }

  const token =
    typeof body?.token === "string" ? body.token : "";

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return json({
      success: false,
      error: "Invalid or expired confirmation link"
    }, 400);
  }

  const tokenHash = await hashToken(token);

  try {
    // Update subscriber only when the token is valid and unused.
    const result = await env.DB.prepare(
      `UPDATE newsletter_subscribers
       SET status = 'confirmed',
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending'
         AND id = (
           SELECT subscriber_id
           FROM newsletter_tokens
           WHERE token_hash = ?
             AND purpose = 'confirm'
             AND used_at IS NULL
             AND expires_at > CURRENT_TIMESTAMP
         )`
    ).bind(tokenHash).run();

    if (result.meta?.changes !== 1) {
      return json({
        success: false,
        error: "Invalid, expired or already used confirmation link"
      }, 400);
    }

    // Mark the confirmation token as used.
    await env.DB.prepare(
      `UPDATE newsletter_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE token_hash = ?
         AND purpose = 'confirm'
         AND used_at IS NULL`
    ).bind(tokenHash).run();

    return json({
      success: true,
      message: "Your newsletter subscription is confirmed."
    });

  } catch {
    console.error("Newsletter confirmation failed");

    return json({
      success: false,
      error: "Service temporarily unavailable"
    }, 503);
  }
}
