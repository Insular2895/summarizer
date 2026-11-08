import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("macOS Keychain stores and removes API keys without a plaintext file", async (context) => {
  if (process.platform !== "darwin") {
    context.skip("macOS Keychain is only available on Darwin.");
    return;
  }
  delete process.env.TRANSCRIPT_STORE_BACKEND;
  process.env.TRANSCRIPT_KEYCHAIN_SERVICE = `com.graphipy.transcript.test.${process.pid}`;
  process.env.TRANSCRIPT_ENV_PATH = path.join(os.tmpdir(), `transcript-missing-env-${process.pid}`);
  const store = await import(`../scripts/api-key-store.mjs?keychain=${Date.now()}`);
  const fakeSummary = "test-summary-key-not-real-1234567890";
  const fakeDeepDive = "test-deep-dive-key-not-real-1234567890";

  try {
    const saved = await store.saveApiKeys({
      geminiSummary: fakeSummary,
      geminiDeepDive: fakeDeepDive,
    });
    assert.equal(saved.storage, "macos-keychain");
    assert.deepEqual(saved.configured, { geminiSummary: true, geminiDeepDive: true });
    assert.equal(await store.getApiKey("geminiSummary"), fakeSummary);
    assert.equal(await store.getApiKey("geminiDeepDive"), fakeDeepDive);
  } finally {
    await store.removeApiKey("geminiSummary");
    const removed = await store.removeApiKey("geminiDeepDive");
    assert.deepEqual(removed.configured, { geminiSummary: false, geminiDeepDive: false });
  }
});
