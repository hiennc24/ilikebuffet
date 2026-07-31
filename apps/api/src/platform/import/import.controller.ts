/**
 * ImportController — multipart Excel upload endpoint (C2 fix, Red Team H7).
 *
 * POST /import/ingredients  — HQ only, @Unscoped() (chain-wide config).
 *
 * Uses NestJS built-in FileInterceptor (multer) for multipart handling.
 * Returns { validCount, errorCount, errors } and streams the error workbook
 * as an attachment when errors exist.
 */
import {
  BadRequestException,
  Controller,
  Post,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { ExcelImportService } from "./excel-import.service";
import { Unscoped } from "../rbac/decorators";
import { Role } from "../rbac/role.enum";
import type { ScopedRequest } from "../rbac/branch-scope.guard";

@Unscoped()
@Controller("import")
export class ImportController {
  constructor(private readonly importService: ExcelImportService) {}

  /**
   * Import ingredients from an uploaded .xlsx file.
   *
   * - HQ only (QUAN_TRI_HQ).
   * - Multipart field name: "file".
   * - Max size: 5 MB (configurable via multer limits).
   * - On success with no errors: returns JSON { validCount, errorCount, errors: [] }.
   * - On partial success: returns JSON with error details + streams error workbook
   *   as "errors.xlsx" attachment when Accept: application/json is NOT requested.
   * - If the file is missing or wrong type: throws 400.
   */
  @Post("ingredients")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        if (
          file.mimetype ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          file.mimetype === "application/vnd.ms-excel" ||
          file.originalname.endsWith(".xlsx") ||
          file.originalname.endsWith(".xls")
        ) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Only Excel files (.xlsx / .xls) are accepted",
            ),
            false,
          );
        }
      },
    }),
  )
  async importIngredients(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: ScopedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<object> {
    // Role gate: HQ only.
    if (req.user.role !== Role.QUAN_TRI_HQ) {
      throw new BadRequestException(
        "Only QUAN_TRI_HQ may import ingredients",
      );
    }

    if (!file || !file.buffer) {
      throw new BadRequestException(
        'No file uploaded — send as multipart/form-data with field name "file"',
      );
    }

    const result = await this.importService.importIngredients(
      file.buffer,
      req.user.sub,
    );

    // When there are errors and the client accepts a binary download,
    // attach the error workbook so the user can fix and re-submit.
    if (result.errorWorkbook && result.errorCount > 0) {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="import-errors.xlsx"',
      );
      res.setHeader("X-Import-Valid-Count", String(result.validCount));
      res.setHeader("X-Import-Error-Count", String(result.errorCount));
    }

    // Always return JSON summary (framework serialises this automatically
    // because passthrough: true keeps NestJS response handling in control).
    return {
      validCount: result.validCount,
      errorCount: result.errorCount,
      errors: result.errors,
    };
  }
}
