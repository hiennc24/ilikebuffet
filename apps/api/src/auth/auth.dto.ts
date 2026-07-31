/**
 * Auth DTOs — validated at controller boundaries.
 * No class-validator in this project yet; validation is manual/guard-level.
 * These are plain typed interfaces used for request body typing.
 */

export interface LoginDto {
  username: string;
  password: string;
}

export interface RefreshDto {
  refreshToken: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface PinLoginDto {
  /** Server-issued device identifier (Red Team H4). */
  deviceId: string;
  /** Per-device secret returned once at registration (argon2-hashed at rest). */
  deviceSecret: string;
  /** AppUser.id for the cashier picking their name on the lock screen. */
  userId: string;
  /** 6-digit cashier PIN (separate from approval PIN — dual-PIN invariant). */
  pin: string;
}

export interface SetCashierPinDto {
  pin: string; // 6 digits
}

export interface SetApprovalPinDto {
  pin: string; // 6 digits
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
}

export interface RefreshResponse {
  accessToken: string;
}
