import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      APP_ENV: "test";
      WORKER_API_TOKEN: string;
      TEST_MIGRATIONS: D1Migration[];
    }

    interface GlobalProps {
      mainModule: typeof import("../src/index");
    }
  }
}

export {};
