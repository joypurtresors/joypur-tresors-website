
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

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

  const contentType =
    (request.headers.get("Content-Type") || "").toLowerCase();

  if (!contentType.includes("application/json")) {
    return json({
      success: false,
      error: "JSON required"
    }, 415);
  }

  let body;

  try {
    const raw = await request.text();

    if (raw.length > 2048) {
      return json({
        success: false,
        error: "Request too large"
      }, 413);
    }

    body = JSON.parse(raw);
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

  try {
    const tokenHash = await hashToken(token);

    // Confirmation is allowed only for a pending subscriber
    // with a valid, unused and unexpired confirmation token.
    //
    // The Preview D1 trigger automatically creates the
    // welcome queue entry on pending -> confirmed.

   
const confirmed = await env.DB.prepare(
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
     )
   RETURNING id`
).bind(tokenHash).first();

if (!confirmed) {
  return json({
    success: false,
    error: "Invalid, expired or already confirmed link"
  }, 400);
}
    
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
