import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/app/**/*.test.ts"], environment: "node" },
});
