import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.tsbuildinfo", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "import-x": importX },
    settings: {
      // Switched from eslint-plugin-import@2.x to eslint-plugin-import-x (actively
      // maintained, real flat-config resolver support) after a Review finding that the
      // original config's `import/no-cycle` was silently catching nothing. Confirmed
      // this resolver is genuinely wired correctly — import-x/no-unresolved correctly
      // flags an unresolvable import under this exact config.
      "import-x/resolver": { typescript: true },
    },
    rules: {
      // AD-9: no dead code / no boundary violations, build-breaking not warnings.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
      "no-unreachable": "error",
      "import-x/no-unresolved": "error",
      // import-x/no-cycle deliberately left OFF: verified the resolver above is
      // correctly wired (no-unresolved fires correctly), but no-cycle itself still does
      // not fire on an unambiguous 2-file mutual-import cycle in this project — tested
      // against eslint-import-resolver-typescript 3.x (legacy interface) and 4.x
      // (resolver-next), with and without type-aware parsing (parserOptions.projectService),
      // with and without `.js`-suffixed specifiers, in both this full config and a
      // maximally minimal isolated repro. This is a real limitation in
      // eslint-plugin-import-x@4.17.1's no-cycle rule for this setup, not a
      // misconfiguration — enabling it would give false confidence rather than real
      // protection. Revisit when the upstream rule improves, or replace with a
      // dedicated cycle-detection tool (e.g. `madge --circular`) as a CI step.
    },
  },
);
