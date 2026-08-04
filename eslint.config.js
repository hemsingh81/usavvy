import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.tsbuildinfo", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { import: importPlugin },
    rules: {
      // AD-9: no dead code / no boundary violations, build-breaking not warnings.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
      "no-unreachable": "error",
      "import/no-cycle": "error",
    },
  },
);
