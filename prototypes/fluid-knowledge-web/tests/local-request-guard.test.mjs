import assert from "node:assert/strict";
import test from "node:test";
import { hasSameOrigin, isLoopbackRequest } from "../scripts/local-request-guard.mjs";

test("private local routes accept loopback and reject network clients", () => {
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "::1" } }), true);
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "192.168.1.20" } }), false);
});

test("mutations require an explicit matching browser origin", () => {
  const request = { headers: { host: "127.0.0.1:4173" } };
  assert.equal(hasSameOrigin(request), false);
  assert.equal(hasSameOrigin(request, { allowMissing: true }), true);
  assert.equal(
    hasSameOrigin({
      headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" },
    }),
    true,
  );
  assert.equal(
    hasSameOrigin({
      headers: { host: "127.0.0.1:4173", origin: "https://evil.example" },
    }),
    false,
  );
});
