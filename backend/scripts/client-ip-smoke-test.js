import assert from "assert";
import {
  getClientIpFromForwarded,
  getClientIpFromRequest,
  getClientIpFromSocket,
} from "../src/utils/clientIp.js";

assert.strictEqual(
  getClientIpFromForwarded("203.0.113.1, 10.0.0.1"),
  "203.0.113.1",
);
assert.strictEqual(getClientIpFromForwarded("", "127.0.0.1"), "127.0.0.1");
assert.strictEqual(
  getClientIpFromRequest({
    headers: { "x-forwarded-for": "198.51.100.2, 10.0.0.5" },
    socket: { remoteAddress: "127.0.0.1" },
  }),
  "198.51.100.2",
);
assert.strictEqual(
  getClientIpFromRequest({
    headers: { "x-real-ip": "203.0.113.9" },
    socket: { remoteAddress: "127.0.0.1" },
  }),
  "203.0.113.9",
);

assert.strictEqual(
  getClientIpFromSocket({
    handshake: {
      headers: { "x-forwarded-for": "192.0.2.10, 172.16.0.1" },
      address: "::1",
    },
  }),
  "192.0.2.10",
);

console.log("Client IP utility smoke test passed.");
