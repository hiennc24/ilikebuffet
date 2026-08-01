/**
 * Tests that branch list is scoped to caller's branches for non-chainWide users.
 *
 * Tests the BranchService.list() allowedBranchIds filter parameter.
 * The controller layer maps req.user.chainWide/branchIds to this parameter.
 */
import { BranchService } from "./branch.service";
import type { TxClient } from "../../prisma/prisma.service";

function makeBranch(id: string, code: string) {
  return {
    id,
    code,
    name: `Branch ${code}`,
    status: "ACTIVE",
    address: "Addr",
    phone: "09000",
    operatingHours: null,
    bankAccount: { number: "123", bank: "VCB", holder: "Test" },
    billInfo: null,
    logoUrl: null,
    createdAt: new Date(),
    _count: { users: 0 },
  };
}

const CN01 = makeBranch("br1", "CN01");
const CN02 = makeBranch("br2", "CN02");

function makeMockPrisma(branches: typeof CN01[]) {
  const tx = {
    branch: {
      findUnique: jest.fn().mockResolvedValue(branches[0]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 1n }) },
  } as unknown as TxClient;

  const prisma = {
    ...tx,
    branch: {
      findMany: jest.fn().mockImplementation(
        ({ where }: { where?: { id?: { in?: string[] } } }) => {
          const allowed = where?.id?.in;
          const result = allowed
            ? branches.filter((b) => allowed.includes(b.id))
            : branches;
          return Promise.resolve(result);
        },
      ),
      count: jest.fn().mockImplementation(
        ({ where }: { where?: { id?: { in?: string[] } } }) => {
          const allowed = where?.id?.in;
          const result = allowed
            ? branches.filter((b) => allowed.includes(b.id)).length
            : branches.length;
          return Promise.resolve(result);
        },
      ),
      findUnique: jest.fn().mockResolvedValue(branches[0]),
    },
    withTx: jest.fn().mockImplementation(
      (fn: (tx: TxClient) => Promise<unknown>) => fn(tx),
    ),
  };
  return { prisma };
}

function makeAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

// ─── BranchService.list() with allowedBranchIds ──────────────────────────────

describe("BranchService.list() branch scoping", () => {
  it("returns all branches when allowedBranchIds is undefined (chain-wide)", async () => {
    const { prisma } = makeMockPrisma([CN01, CN02]);
    const service = new BranchService(prisma as never, makeAudit() as never);

    const result = await service.list({}, undefined); // chain-wide: no filter
    expect(result.total).toBe(2);
    expect(result.data.map((b) => b.id)).toContain("br1");
    expect(result.data.map((b) => b.id)).toContain("br2");
  });

  it("scopes list to caller's branches when allowedBranchIds is provided", async () => {
    const { prisma } = makeMockPrisma([CN01, CN02]);
    const service = new BranchService(prisma as never, makeAudit() as never);

    // QL_CN only belongs to br1.
    const result = await service.list({}, ["br1"]);
    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe("br1");
    // Verify the DB query received the id filter.
    const findManyCall = (
      prisma as unknown as {
        branch: { findMany: jest.Mock };
      }
    ).branch.findMany.mock.calls[0][0] as { where?: { id?: { in?: string[] } } };
    expect(findManyCall?.where?.id).toEqual({ in: ["br1"] });
  });

  it("returns empty list when user has no branch memberships", async () => {
    const { prisma } = makeMockPrisma([CN01, CN02]);
    const service = new BranchService(prisma as never, makeAudit() as never);

    const result = await service.list({}, []); // empty allowlist
    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it("applies both status filter and branch scope filter", async () => {
    const { prisma } = makeMockPrisma([CN01]);
    const service = new BranchService(prisma as never, makeAudit() as never);

    await service.list({ status: "ACTIVE" }, ["br1"]);

    const call = (
      prisma as unknown as { branch: { findMany: jest.Mock } }
    ).branch.findMany.mock.calls[0][0] as {
      where?: { status?: string; id?: { in: string[] } };
    };
    expect(call?.where?.status).toBe("ACTIVE");
    expect(call?.where?.id).toEqual({ in: ["br1"] });
  });
});
