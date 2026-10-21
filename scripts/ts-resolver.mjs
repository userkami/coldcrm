/**
 * A resolver hook for `node --test`.
 *
 * The application source uses extensionless relative imports, which is what
 * Next.js expects and what TypeScript's "bundler" resolution allows. Node's
 * own ESM resolver requires an explicit extension, so this hook fills in the
 * `.ts` file for relative specifiers that do not already have one.
 *
 * It exists only for the test runner; the Next.js build is unaffected.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Only relative specifiers are affected.
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      return nextResolve(specifier, context);
    }

    const parentURL = context.parentURL;
    if (!parentURL) return nextResolve(specifier, context);

    // If the specifier already resolves, leave it alone.
    try {
      return nextResolve(specifier, context);
    } catch {
      // fall through to the extension search
    }

    const base = new URL(specifier, parentURL);
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) {
        return nextResolve(candidate.href, context);
      }
    }

    return nextResolve(specifier, context);
  },
});
