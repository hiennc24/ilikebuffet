/**
 * Repo-wide guard: no controller may import a class DTO with `import type`.
 *
 * TypeScript elides type-only imports, so a class-validator DTO imported that way
 * is absent at runtime and `design:paramtypes` reflects the @Query()/@Body() param
 * as `Function`. The global ValidationPipe then rejects every property. This scans
 * all *.controller.ts and fails if any `import type { … } from "…dto"` names a file
 * that exports a class — catching current and future regressions across the API.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const SRC = join(__dirname, "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const exportsAClass = (dtoFile: string): boolean => {
  try {
    return /^export class /m.test(readFileSync(dtoFile, "utf8"));
  } catch {
    return false;
  }
};

describe("controllers value-import their class DTOs", () => {
  it("no *.controller.ts imports a class DTO with `import type`", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC).filter((f) => f.endsWith(".controller.ts"))) {
      const src = readFileSync(file, "utf8");
      const re = /import\s+type\s*\{[^}]*\}\s*from\s*"([^"]+)"/gs;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const spec = m[1];
        if (!/dto/i.test(spec)) continue;
        const dtoFile = resolve(dirname(file), spec.endsWith(".ts") ? spec : `${spec}.ts`);
        if (exportsAClass(dtoFile)) offenders.push(`${file.replace(SRC, "src")} ← import type from "${spec}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
