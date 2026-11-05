
const MAX_ATTEMPTS = 3;
const COOLDOWN_MINUTES = 15;
const WINDOW_HOURS = 24;

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

const genericResponse = {
  success: true,
  message: "If eligible, an unsubscribe link will arrive shortly."
};

function validEmail(email) {
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return Array.from(bytes, b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(digest), b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function utcTimestamp(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export async function onRequestPost({ request, env }) {
  if (
    !env.DB ||
    !env.RESEND_API_KEY ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.NEWSLETTER_FROM_EMAIL
  ) {
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

  if (
    !(request.headers.get("Content-Type") || "")
      .toLowerCase()
      .includes("application/json")
  ) {
    return json({
      success: false,
      error: "JSON required"
    }, 415);
  }

  let body;

  try {
    const raw = await request.text();

    if (raw.length > 4096) {
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

  const email =
    typeof body?.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  const captcha =
    typeof body?.turnstile_token === "string"
      ? body.turnstile_token
      : "";

  if (!validEmail(email)) {
    return json({
      success: false,
      error: "Valid email required"
    }, 400);
  }

  if (!captcha || captcha.length > 2048) {
    return json({
      success: false,
      error: "Security verification required"
    }, 400);
  }

  // Verify Turnstile on the server.
  const form = new FormData();

  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", captcha);

  const ip = request.headers.get("CF-Connecting-IP");

  if (ip) {
    form.append("remoteip", ip);
  }

  let verification;

  try {
    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: form
      }
    );

    if (!verifyResponse.ok) {
      throw new Error("Turnstile unavailable");
    }

    verification = await verifyResponse.json();
  } catch {
    return json({
      success: false,
      error: "Security verification unavailable"
    }, 503);
  }

  if (
    verification.success !== true ||
    verification.hostname !== url.hostname
  ) {
    return json({
      success: false,
      error: "Security verification failed"
    }, 403);
  }

  try {
    // Never disclose whether an email is subscribed.
    const subscriber = await env.DB.prepare(
      `SELECT id
       FROM newsletter_subscribers
       WHERE email = ?
         AND status = 'confirmed'`
    ).bind(email).first();

    if (!subscriber) {
      return json(genericResponse);
    }

    const now = new Date();

    const cutoff = utcTimestamp(
      new Date(now.getTime() - WINDOW_HOURS * 3600000)
    );

    const nextAllowed = utcTimestamp(
      new Date(now.getTime() + COOLDOWN_MINUTES * 60000)
    );

    // Atomically reserve the cooldown.
    const reservation = await env.DB.prepare(
      `INSERT INTO newsletter_manage_cooldowns
         (subscriber_id, next_allowed_at)
       VALUES (?, ?)
       ON CONFLICT(subscriber_id) DO UPDATE SET
         next_allowed_at = excluded.next_allowed_at
       WHERE next_allowed_at <= CURRENT_TIMESTAMP`
    ).bind(subscriber.id, nextAllowed).run();

    if (reservation.meta?.changes !== 1) {
      return json(genericResponse);
    }

    // Maximum three attempts in a rolling 24-hour window.
    const attempt = await env.DB.prepare(
      `INSERT INTO newsletter_manage_attempts
         (subscriber_id, attempted_at)
       SELECT ?, CURRENT_TIMESTAMP
       WHERE (
         SELECT COUNT(*)
         FROM newsletter_manage_attempts
         WHERE subscriber_id = ?
           AND attempted_at > ?
       ) < ?`
    ).bind(
      subscriber.id,
      subscriber.id,
      cutoff,
      MAX_ATTEMPTS
    ).run();

    if (attempt.meta?.changes !== 1) {
      return json(genericResponse);
    }

    // Create a fresh unsubscribe token.
    const token = createToken();
    const tokenHash = await sha256(token);

    await env.DB.prepare(
      `INSERT INTO newsletter_tokens
         (token_hash, subscriber_id, purpose, expires_at)
       VALUES (?, ?, 'unsubscribe', datetime('now', '+24 hours'))`
    ).bind(tokenHash, subscriber.id).run();

    const unsubscribeURL =
      `${url.origin}/newsletter-unsubscribe.html?token=${token}`;

    const emailText = [
      "Joypur Tresors Newsletter",
      "",
      "We received a request to manage your newsletter subscription.",
      "",
      "To unsubscribe, open this link:",
      unsubscribeURL,
      "",
      "This link expires in 24 hours.",
      "If you did not request this, you can ignore this email."
    ].join("\n");

    try {
      const sendResponse = await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": tokenHash
          },
          body: JSON.stringify({
            from: env.NEWSLETTER_FROM_EMAIL,
            to: [email],
            subject: "Manage your Joypur Tresors newsletter",
            text: emailText
          })
        }
      );

      if (!sendResponse.ok) {
        console.error(
          "Newsletter manage provider rejected request:",
          sendResponse.status
        );
      }
    } catch {
      // Outcome may be uncertain; do not automatically resend.
      console.error("Newsletter manage provider outcome uncertain");
    }

    return json(genericResponse);

  } catch {
    console.error("Newsletter manage request failed");

    return json({
      success: false,
      error: "Service temporarily unavailable"
    }, 503);
  }
}
