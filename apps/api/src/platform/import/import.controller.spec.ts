/**
 * ImportController unit tests (multipart upload endpoint).
 *
 * Tests:
 *   - Missing file → 400.
 *   - Non-HQ role → 400 (role gate).
 *   - HQ role + valid file → delegates to ExcelImportService and returns summary.
 *   - HQ role + file with errors → returns error summary.
 */
import { BadRequestException } from "@nestjs/common";
import { ImportController } from "./import.controller";
import type { ScopedRequest } from "../rbac/branch-scope.guard";
import type { Response } from "express";

function makeReq(role: string): ScopedRequest {
  return {
    user: {
      sub: "user1",
      username: "testuser",
      role,
      branchIds: [],
      chainWide: role === "QUAN_TRI_HQ",
    },
    branchScope: { chainWide: role === "QUAN_TRI_HQ", branchIds: [] },
  } as unknown as ScopedRequest;
}

function makeFile(name = "test.xlsx"): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: name,
    encoding: "7bit",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("fake xlsx content"),
    size: 100,
    stream: undefined as never,
    destination: "",
    filename: name,
    path: "",
  };
}

function makeRes(): Response {
  return {
    setHeader: jest.fn(),
  } as unknown as Response;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ImportController — POST /import/ingredients", () => {
  it("throws 400 when no file is provided", async () => {
    const importService = { importIngredients: jest.fn() };
    const controller = new ImportController(importService as never);

    await expect(
      controller.importIngredients(
        undefined,
        makeReq("QUAN_TRI_HQ"),
        makeRes(),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(importService.importIngredients).not.toHaveBeenCalled();
  });

  it("throws 400 when caller is not QUAN_TRI_HQ", async () => {
    const importService = { importIngredients: jest.fn() };
    const controller = new ImportController(importService as never);

    await expect(
      controller.importIngredients(
        makeFile(),
        makeReq("QUAN_LY_CN"),
        makeRes(),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(importService.importIngredients).not.toHaveBeenCalled();
  });

  it("delegates to ExcelImportService and returns summary on success", async () => {
    const importResult = {
      validCount: 5,
      errorCount: 0,
      errors: [],
      errorWorkbook: undefined,
    };
    const importService = {
      importIngredients: jest.fn().mockResolvedValue(importResult),
    };
    const controller = new ImportController(importService as never);

    const result = await controller.importIngredients(
      makeFile(),
      makeReq("QUAN_TRI_HQ"),
      makeRes(),
    );

    expect(importService.importIngredients).toHaveBeenCalledWith(
      expect.any(Buffer),
      "user1",
    );
    expect(result).toEqual({
      validCount: 5,
      errorCount: 0,
      errors: [],
    });
  });

  it("returns error summary and sets headers when import has row errors", async () => {
    const errorWorkbook = Buffer.from("fake error xlsx");
    const importResult = {
      validCount: 2,
      errorCount: 3,
      errors: [
        { rowNumber: 2, data: {}, reasons: ["Thiếu tên nguyên liệu"] },
        { rowNumber: 3, data: {}, reasons: ["Đơn vị gốc không tồn tại"] },
        { rowNumber: 5, data: {}, reasons: ["Hệ số 1 phải > 0"] },
      ],
      errorWorkbook,
    };
    const importService = {
      importIngredients: jest.fn().mockResolvedValue(importResult),
    };
    const controller = new ImportController(importService as never);
    const res = makeRes();

    const result = await controller.importIngredients(
      makeFile(),
      makeReq("QUAN_TRI_HQ"),
      res,
    );

    expect(result).toEqual({
      validCount: 2,
      errorCount: 3,
      errors: importResult.errors,
    });

    // Error workbook headers must be set on the response.
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringContaining("import-errors.xlsx"),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-Import-Error-Count",
      "3",
    );
  });
});
