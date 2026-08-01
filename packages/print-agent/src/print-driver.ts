/**
 * Print transport behind a stable interface. The Loopback
 * driver (captures jobs, always succeeds) makes the whole flow testable without
 * hardware. The USB/LAN drivers are declared but throw until a printer model is
 * pinned — no silent no-op that would look like a successful print.
 */

export interface PrintDriver {
  readonly name: string;
  print(data: Uint8Array): Promise<void>;
}

/**
 * In-memory driver for tests. Records every job so callers (and the HTTP
 * server's tests) can assert what would have been sent to the printer.
 */
export class LoopbackPrintDriver implements PrintDriver {
  readonly name = "loopback";
  readonly jobs: Uint8Array[] = [];

  async print(data: Uint8Array): Promise<void> {
    this.jobs.push(data);
  }

  get lastJob(): Uint8Array | undefined {
    return this.jobs[this.jobs.length - 1];
  }
}

/** A driver that always fails — used to test the non-blocking print-failure path. */
export class FailingPrintDriver implements PrintDriver {
  readonly name = "failing";
  constructor(private readonly message = "printer offline") {}
  async print(): Promise<void> {
    throw new Error(this.message);
  }
}

/**
 * USB driver placeholder. Wiring a concrete ESC/POS-over-USB library requires
 * pinning a printer model first; until then it fails loudly.
 */
export class UsbPrintDriver implements PrintDriver {
  readonly name = "usb";
  async print(): Promise<void> {
    throw new Error(
      "USB print driver not configured — pin the printer model before enabling",
    );
  }
}

/** LAN (network 9100) driver placeholder — throws until a printer model is pinned. */
export class LanPrintDriver implements PrintDriver {
  readonly name = "lan";
  constructor(private readonly host?: string, private readonly port = 9100) {}
  async print(): Promise<void> {
    throw new Error(
      `LAN print driver not configured (host=${this.host ?? "?"}:${this.port}) — pin the printer model before enabling`,
    );
  }
}
