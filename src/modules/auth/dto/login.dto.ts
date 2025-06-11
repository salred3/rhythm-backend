export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
  deviceFingerprint?: string;
  captchaToken?: string;
}

/**
 * Validation rules for login
 */
export const LoginValidation = {
  email: {
    required: true,
    type: 'email',
    maxLength: 255,
    transform: (value: string) => value.toLowerCase().trim(),
  },
  password: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 128,
  },
  rememberMe: {
    required: false,
    type: 'boolean',
    default: false,
  },
  deviceFingerprint: {
    required: false,
    type: 'string',
    maxLength: 255,
  },
  captchaToken: {
    required: false,
    type: 'string',
    maxLength: 1000,
  },
};

/**
 * Validate login data
 */
export function validateLoginDto(data: any): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {};

  // Email validation
  if (!data.email) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(data.email)) {
    errors.email = 'Invalid email format';
  }

  // Password validation
  if (!data.password) {
    errors.password = 'Password is required';
  }

  // Device fingerprint format validation (if provided)
  if (data.deviceFingerprint && typeof data.deviceFingerprint !== 'string') {
    errors.deviceFingerprint = 'Invalid device fingerprint format';
  }

  // CAPTCHA token validation (if required)
  if (process.env.REQUIRE_CAPTCHA === 'true' && !data.captchaToken) {
    errors.captchaToken = 'CAPTCHA verification required';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

/**
 * Transform login data
 */
export function transformLoginDto(data: any): LoginDto {
  return {
    email: data.email?.toLowerCase().trim(),
    password: data.password,
    rememberMe: Boolean(data.rememberMe),
    deviceFingerprint: data.deviceFingerprint,
    captchaToken: data.captchaToken,
  };
}

/**
 * Email validation helper
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Additional login-related DTOs
 */

export interface TwoFactorLoginDto extends LoginDto {
  twoFactorCode: string;
  trustDevice?: boolean;
}

export interface SocialLoginDto {
  provider: 'google' | 'github' | 'microsoft' | 'apple';
  accessToken: string;
  idToken?: string;
  deviceFingerprint?: string;
}

export interface MagicLinkLoginDto {
  email: string;
  redirectUrl?: string;
}

export interface BiometricLoginDto {
  userId: string;
  biometricSignature: string;
  deviceId: string;
  challengeResponse: string;
}
