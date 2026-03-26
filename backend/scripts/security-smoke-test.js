#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:8001";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseSetCookieCookies(setCookieHeader) {
  if (!setCookieHeader) return [];
  const raw = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : typeof setCookieHeader.getSetCookie === "function"
      ? setCookieHeader.getSetCookie()
      : [setCookieHeader];

  return raw
    .map((line) => line.split(";")[0])
    .filter(Boolean);
}

async function run() {
  console.log(`[smoke] Running security smoke test against ${baseUrl}`);

  const healthRes = await fetch(`${baseUrl}/health`);
  assert(healthRes.ok, "Health endpoint is not reachable.");
  const healthBody = await healthRes.json();
  assert(healthBody.status === "ok", "Health status is not ok.");
  console.log("[pass] Health endpoint is healthy");

  const csrfRes = await fetch(`${baseUrl}/api/v1/auth/csrf-token`, {
    method: "GET",
    redirect: "manual",
  });

  assert(csrfRes.ok, "CSRF bootstrap endpoint failed.");
  const csrfBody = await csrfRes.json();
  assert(csrfBody.csrfToken, "CSRF token missing in response body.");

  const cookies = parseSetCookieCookies(csrfRes.headers);
  const xsrfCookie = cookies.find((c) => c.startsWith("XSRF-TOKEN="));
  assert(xsrfCookie, "XSRF-TOKEN cookie not set by backend.");
  console.log("[pass] CSRF bootstrap works and sets cookie");

  const loginWithoutCsrf = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "dummy", password: "dummy" }),
  });

  assert(
    loginWithoutCsrf.status === 403,
    `Expected 403 without CSRF header, got ${loginWithoutCsrf.status}`,
  );
  console.log("[pass] CSRF protection blocks missing token");

  const loginWithCsrf = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": csrfBody.csrfToken,
      Cookie: xsrfCookie,
    },
    body: JSON.stringify({ username: "dummy", password: "dummy" }),
  });

  assert(
    [400, 401, 404].includes(loginWithCsrf.status),
    `Expected auth rejection (400/401/404), got ${loginWithCsrf.status}`,
  );
  console.log("[pass] Auth endpoint responds safely with CSRF token");

  const headersToCheck = [
    "x-content-type-options",
    "x-frame-options",
    "x-dns-prefetch-control",
  ];
  for (const h of headersToCheck) {
    assert(healthRes.headers.get(h), `Missing security header: ${h}`);
  }
  console.log("[pass] Core security headers are present");

  console.log("Security smoke test passed.");
}

run().catch((err) => {
  console.error(`[fail] ${err.message}`);
  process.exit(1);
});
