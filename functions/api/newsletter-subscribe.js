
const MAX_ATTEMPTS = 3;
const COOLDOWN_MINUTES = 15;
const WINDOW_HOURS = 24;

const responseJSON = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

const genericResponse = {
  success: true,
  message: "If eligible, a confirmation email will arrive shortly."
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
    return responseJSON({
      success: false,
      error: "Service unavailable"
    }, 503);
  }

  const url = new URL(request.url);

  if (request.headers.get("Origin") !== url.origin) {
    return responseJSON({
      success: false,
      error: "Forbidden origin"
    }, 403);
  }

  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return responseJSON({
      success: false,
      error: "JSON required"
    }, 415);
  }

  let body;

  try {
    const raw = await request.text();

    if (raw.length > 4096) {
      return responseJSON({
        success: false,
        error: "Request too large"
      }, 413);
    }

    body = JSON.parse(raw);
  } catch {
    return responseJSON({
      success: false,
      error: "Invalid request"
    }, 400);
  }

  const email =
    typeof body?.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  if (!validEmail(email) || body?.consent !== true) {
    return responseJSON({
      success: false,
      error: "Valid email and consent required"
    }, 400);
  }

  const captcha =
    typeof body?.turnstile_token === "string"
      ? body.turnstile_token
      : "";

  if (!captcha || captcha.length > 2048) {
    return responseJSON({
      success: false,
      error: "Security verification required"
    }, 400);
  }

  // Verify CAPTCHA on the server.
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
    return responseJSON({
      success: false,
      error: "Security verification unavailable"
    }, 503);
  }

  if (
    verification.success !== true ||
    verification.hostname !== url.hostname
  ) {
    return responseJSON({
      success: false,
      error: "Security verification failed"
    }, 403);
  }

  try {
    // Existing confirmed/unsubscribed users remain unchanged.
    await env.DB.prepare(
      `INSERT INTO newsletter_subscribers (email, status)
       VALUES (?, 'pending')
       ON CONFLICT(email) DO NOTHING`
    ).bind(email).run();

    const subscriber = await env.DB.prepare(
      `SELECT id, status
       FROM newsletter_subscribers
       WHERE email = ?`
    ).bind(email).first();

    if (!subscriber || subscriber.status !== "pending") {
      return responseJSON(genericResponse);
    }

    const now = new Date();
    const cutoff = utcTimestamp(
      new Date(now.getTime() - WINDOW_HOURS * 3600000)
    );

    const nextAllowed = utcTimestamp(
      new Date(now.getTime() + COOLDOWN_MINUTES * 60000)
    );

    // A single conditional D1 statement reserves a cooldown.
    // This prevents simultaneous requests from passing it.
    const reservation = await env.DB.prepare(
      `INSERT INTO newsletter_confirmation_cooldowns
         (subscriber_id, next_allowed_at)
       VALUES (?, ?)
       ON CONFLICT(subscriber_id) DO UPDATE SET
         next_allowed_at = excluded.next_allowed_at
       WHERE next_allowed_at <= CURRENT_TIMESTAMP`
    ).bind(subscriber.id, nextAllowed).run();

    if (reservation.meta?.changes !== 1) {
      return responseJSON(genericResponse);
    }

    // Record an attempt only if fewer than 3 attempts exist
    // within the previous rolling 24 hours.
    const attempt = await env.DB.prepare(
      `INSERT INTO newsletter_confirmation_attempts
         (subscriber_id, attempted_at)
       SELECT ?, CURRENT_TIMESTAMP
       WHERE (
         SELECT COUNT(*)
         FROM newsletter_confirmation_attempts
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
      return responseJSON(genericResponse);
    }

    // Secure random token. Only its hash is stored.
    const token = createToken();
    const tokenHash = await sha256(token);

    await env.DB.prepare(
      `INSERT INTO newsletter_tokens
         (token_hash, subscriber_id, purpose, expires_at)
       VALUES (?, ?, 'confirm', datetime('now', '+24 hours'))`
    ).bind(tokenHash, subscriber.id).run();

    const confirmURL =
      `${url.origin}/newsletter-confirm.html?token=${token}`;

    const emailText = [
      "Please confirm your Joypur Tresors newsletter subscription.",
      "",
      "Click the link below to confirm:",
      confirmURL,
      "",
      "This link expires in 24 hours.",
      "If you did not subscribe, ignore this email."
    ].join("\n");

    let sendResponse;

    try {
      sendResponse = await fetch(
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
            subject:
              "Confirm your Joypur Tresors newsletter subscription",
            text: emailText
          })
        }
      );
    } catch {
      // Network result is uncertain: do not immediately retry.
      console.error("Newsletter provider outcome uncertain");

      return responseJSON(genericResponse);
    }

    if (!sendResponse.ok) {
      // Keep the attempt and cooldown reservation.
      // This prevents repeated abuse when the provider rejects.
      console.error(
        "Newsletter provider rejected request:",
        sendResponse.status
      );

      return responseJSON(genericResponse);
    }

    return responseJSON(genericResponse);

  } catch {
    console.error("Newsletter subscription failed");

    return responseJSON({
      success: false,
      error: "Service temporarily unavailable"
    }, 503);
  }
}
