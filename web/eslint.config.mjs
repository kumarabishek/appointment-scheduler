import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Generated / build output and local dev CLI scripts are not part of the
    // PHI-handling server, so they're out of scope for these rules.
    ignores: ["src/generated/**", ".next/**", "node_modules/**", "next-env.d.ts", "scripts/**"],
  },
  {
    // PHI guard — applies to the app + server code only. A call record or
    // request body holds patient PHI; a stray console.log(record) would leak it
    // into Vercel function logs. This makes that a build failure. If a
    // deliberate log is ever truly needed, add an inline
    // `// eslint-disable-next-line no-console` so it's a conscious decision.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
    },
  },
];

export default config;
