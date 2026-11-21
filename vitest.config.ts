import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["scripts/*.ui.test.tsx"],
    fileParallelism: false,
    testTimeout: 15000,
  },
});
