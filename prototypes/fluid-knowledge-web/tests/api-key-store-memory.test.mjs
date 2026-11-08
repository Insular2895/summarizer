import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("legacy Gemini keys migrate to a non-file secret backend before plaintext removal", async () => {
  const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "transcript-key-migration-"));
  const envPath = path.join(temporaryDir, ".env");
  const fakeKey = "test-gemini-key-not-real-1234567890";
  await writeFile(envPath, `KEEP_OUTPUT_ASK=true\nGEMINI_API_KEY=${fakeKey}\n`, "utf8");
  process.env.TRANSCRIPT_STORE_BACKEND = "memory";
  process.env.TRANSCRIPT_ENV_PATH = envPath;

  try {
    const store = await import(`../scripts/api-key-store.mjs?memory=${Date.now()}`);
    const before = await store.getApiKeySettingsStatus();
    assert.equal(before.legacyEnvironment, true);

    const migrated = await store.migrateLegacyApiKeys();
    assert.equal(migrated.migrated, true);
    assert.deepEqual(migrated.configured, { geminiSummary: true, geminiDeepDive: true });
    assert.equal(await store.getApiKey("geminiSummary"), fakeKey);
    assert.equal(await store.getApiKey("geminiDeepDive"), fakeKey);
    const cleaned = await readFile(envPath, "utf8");
    assert.match(cleaned, /KEEP_OUTPUT_ASK=true/);
    assert.doesNotMatch(cleaned, /GEMINI_API_KEY/);
    assert.doesNotMatch(cleaned, new RegExp(fakeKey));
  } finally {
    delete process.env.TRANSCRIPT_STORE_BACKEND;
    delete process.env.TRANSCRIPT_ENV_PATH;
    await rm(temporaryDir, { recursive: true });
  }
});
