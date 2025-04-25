export default {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  rules: {
    "prettier/prettier": [
      "error",
      {
        semi: false,
        trailingComma: "all",
        singleQuote: true,
      },
    ],
    semi: ["error", "never"],
    // Add any project-specific rules here
  },
  env: {
    node: true,
    jest: true, // Add this line to recognize Jest global variables
  },
};
