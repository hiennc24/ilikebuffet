/**
 * DTOs for role management (RBAC-01). Classes with class-validator so the global
 * ValidationPipe enforces them. Capabilities are validated against the code catalog
 * in the service (ALL_CAPABILITIES).
 */
import { IsArray, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateRoleDto {
  /** Uppercase code, e.g. "CUA_HANG_TRUONG". Distinguishes the role in AppUser.role. */
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, { message: "code phải in hoa, bắt đầu bằng chữ, 2–40 ký tự (A-Z, 0-9, _)" })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsArray()
  @IsString({ each: true })
  capabilities!: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class SetCapabilitiesDto {
  @IsArray()
  @IsString({ each: true })
  capabilities!: string[];
}
