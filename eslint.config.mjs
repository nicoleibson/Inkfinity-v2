import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    ignores: [".next/**", "node_modules/**", "public/**", "dist/**"],
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "off" // React and Next types handle this
    }
  }
];
