/**
 * DTOs for user administration.
 *
 * Responses NEVER include password/PIN hashes. Creation returns a one-time
 * temporary password that the new user must change on first login.
 */
import { IsArray, IsIn, IsOptional, IsString, Matches, MinLength } from "class-validator";

const ROLES = [
  "QUAN_TRI_HQ",
  "CHU_CHUOI",
  "KE_TOAN_CHUOI",
  "QUAN_LY_CN",
  "THU_NGAN",
  "THU_KHO",
] as const;

export class CreateUserDto {
  /** 3–32 chars, letters/digits/._- (unique, enforced by the DB). */
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9._-]{3,32}$/, { message: "username must be 3–32 chars: letters, digits, . _ -" })
  username!: string;

  @IsIn(ROLES)
  role!: (typeof ROLES)[number];

  /** Branch memberships (ignored for chain-wide roles). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
}

export class UserListQuery {
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsIn(["active", "locked"])
  status?: "active" | "locked";

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
