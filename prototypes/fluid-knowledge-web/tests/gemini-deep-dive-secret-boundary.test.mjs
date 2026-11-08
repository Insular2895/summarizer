import assert from "node:assert/strict";
import test from "node:test";
import { childEnvironment } from "../scripts/gemini-deep-dive-dev-plugin.mjs";

test("the deep-dive child receives no provider credential through its environment", () => {
  const placeholder = "not-a-credential";
  const environment = childEnvironment({
    PATH: "/usr/bin:/bin",
    APP_MODE: "test",
    GEMINI_API_KEY: placeholder,
    GEMINI_SUMMARY_API_KEY: placeholder,
    GEMINI_DEEP_DIVE_API_KEY: placeholder,
    OPENAI_API_KEY: placeholder,
    ANTHROPIC_API_KEY: placeholder,
    MISTRAL_API_KEY: placeholder,
    OPENROUTER_API_KEY: placeholder,
    LLM_API_KEY: placeholder,
  });

  assert.deepEqual(environment, { PATH: "/usr/bin:/bin", APP_MODE: "test" });
});
