/**
 * Post-tsc script: copy tokens.css into dist/ so consumers can
 * import '@ilikebuffet/ui/tokens.css' after building.
 */
import { copyFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

mkdirSync(join(root, "dist", "tokens"), { recursive: true });
copyFileSync(
  join(root, "src", "tokens", "tokens.css"),
  join(root, "dist", "tokens", "tokens.css"),
);
// Also copy to dist root for the package.json export alias.
copyFileSync(
  join(root, "src", "tokens", "tokens.css"),
  join(root, "dist", "tokens.css"),
);
console.log("✓ tokens.css copied to dist/");
