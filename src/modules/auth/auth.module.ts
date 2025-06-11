// Authentication & Authorization Module
// A comprehensive, production-ready authentication and authorization module for your Express.js + TypeScript application.
// Features include user registration, login, JWT authentication, RBAC, password reset, session management, and more.

/**
 * Authentication Module
 *
 * This module provides comprehensive authentication and authorization functionality:
 * - User registration and login
 * - JWT-based authentication
 * - Role-based access control (RBAC)
 * - Password reset and management
 * - Session management
 * - Security features (rate limiting, suspicious activity detection)
 * - Multi-company support
 */

// Exporting public API of the module
export { AuthController } from './auth.controller';
export { AuthService } from './auth.service';
export { JwtStrategy, type JwtPayload } from './strategies/jwt.strategy';
export { LocalStrategy } from './strategies/local.strategy';
export { authGuard, optionalAuthGuard, createAuthGuard } from './guards/auth.guard';
export {
  rolesGuard,
  permissionGuard,
  ownershipGuard,
  companyMemberGuard,
  authorize,
  adminOnly,
  memberOnly,
  ownerOnly,
  readPermission,
  writePermission,
  manageTeamPermission,
  type Role,
  type Permission,
} from './guards/roles.guard';
export {
  CurrentUser,
  CurrentUserProp,
  getCurrentUser,
  getCurrentUserId,
  getCurrentUserEmail,
  getCurrentUserRoles,
  getCurrentSessionId,
  userHasRole,
  userHasAnyRole,
  userHasAllRoles,
  isAuthenticated,
  withUser,
  UserContext,
} from './decorators/current-user.decorator';
export {
  Roles,
  Permissions,
  RequireAuth,
  Public,
  RequireCompany,
  ControllerRoles,
  ControllerAuth,
  CompanyId,
  CompanyRole,
  Authorized,
  RequireOwnership,
  DecoratorMetadata,
  applyDecorators,
} from './decorators/roles.decorator';
export {
  SignupDto,
  SignupValidation,
  validateSignupDto,
  transformSignupDto,
} from './dto/signup.dto';
export {
  LoginDto,
  LoginValidation,
  validateLoginDto,
  transformLoginDto,
  TwoFactorLoginDto,
  SocialLoginDto,
  MagicLinkLoginDto,
  BiometricLoginDto,
} from './dto/login.dto';
export {
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  ForgotPasswordValidation,
  ResetPasswordValidation,
  ChangePasswordValidation,
  validateForgotPasswordDto,
  validateResetPasswordDto,
  validateChangePasswordDto,
  transformForgotPasswordDto,
  transformResetPasswordDto,
  transformChangePasswordDto,
  checkPasswordStrength,
} from './dto/reset-password.dto';

// Auth module configuration
export interface AuthModuleConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiry: string;
  jwtRefreshExpiry: string;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  requireEmailVerification: boolean;
  enableTwoFactor: boolean;
  enableBiometric: boolean;
  enableSocialLogin: boolean;
  socialProviders: string[];
  sessionTimeout: number;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    preventCommon: boolean;
    preventReuse: boolean;
    maxAge?: number;
  };
}

// Module initialization helper
export function createAuthModule(config: Partial<AuthModuleConfig> = {}) {
  const defaultConfig: AuthModuleConfig = {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'your-access-secret',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    jwtAccessExpiry: '15m',
    jwtRefreshExpiry: '30d',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 30 * 60 * 1000,
    requireEmailVerification: false,
    enableTwoFactor: false,
    enableBiometric: false,
    enableSocialLogin: false,
    socialProviders: [],
    sessionTimeout: 30 * 24 * 60 * 60 * 1000,
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
      preventCommon: true,
      preventReuse: false,
    },
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Store config for use by services
  process.env.AUTH_CONFIG = JSON.stringify(finalConfig);

  return {
    controller: new AuthController(),
    service: new AuthService(),
    config: finalConfig,
  };
}
