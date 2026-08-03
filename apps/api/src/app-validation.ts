import { ValidationPipe } from "@nestjs/common";

/**
 * The single global input-validation config for the HTTP boundary.
 *
 * Registered as an APP_PIPE in AppModule (not via main.ts useGlobalPipes) so it is
 * active for BOTH the running server and every e2e test — the tests bootstrap
 * AppModule, so they now exercise the same validation the server does. This closes
 * the gap where a validation-config bug (e.g. a DTO imported with `import type`,
 * whose metatype erases and makes the pipe reject every property) passed CI because
 * the tests never wired the pipe.
 *
 * - whitelist: strip properties without a validation decorator.
 * - forbidNonWhitelisted: reject unknown properties with 400 instead of stripping.
 * - transform: coerce primitives (query string "50" → number 50) via class-transformer.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
}
