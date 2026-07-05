import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/triple-slash-reference": "off",
      "@next/next/no-img-element": "off"
    }
  },
  {
    ignores: [
      ".next/**",
      ".local/**",
      "data/**",
      "devspace/**",
      "logs/**",
      "node_modules/**",
      "output/**",
      "outputs/**",
      "profiles/**",
      "storage/video-batches/**"
    ]
  }
);
