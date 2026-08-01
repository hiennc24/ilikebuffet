#!/usr/bin/env node
/**
 * Print-agent CLI entrypoint. M1 runs the Loopback driver (no hardware) so the
 * POS end-to-end flow works; swap the driver here once a printer is pinned.
 *
 *   PRINT_AGENT_PORT (default 7070), PRINT_AGENT_HOST (default 127.0.0.1),
 *   PRINT_AGENT_ORIGIN (CORS allow-origin, default "*").
 */
import { createPrintServer } from "./print-server";

const port = Number(process.env.PRINT_AGENT_PORT ?? 7070);
const host = process.env.PRINT_AGENT_HOST ?? "127.0.0.1";
const allowOrigin = process.env.PRINT_AGENT_ORIGIN ?? "*";

const { server, driver } = createPrintServer({ allowOrigin });
server.listen(port, host, () => {
  console.log(`[print-agent] listening on http://${host}:${port} (driver=${driver.name})`);
});
