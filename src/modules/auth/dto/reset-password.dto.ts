export interface ForgotPasswordDto {
  email: string;
  captchaToken?: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  logoutOtherDevices?: boolean;
}

/**
 * Validation rules for forgot password
 */
export const ForgotPasswordValidation = {
  email: {
    required: true,
    type: 'email',
    maxLength: 255,
    transform: (value: string) => value.toLowerCase().trim(),
  },
  captchaToken: {
    required: false,
    type: 'string',
    maxLength: 1000,
  },
};

/**
 * Validation rules for reset password
 */
export const ResetPasswordValidation = {
  token: {
    required: true,
    type: 'string',
    minLength: 32,
    maxLength: 128,
    pattern: /^[a-fA-F0-9]+$/,
    message: 'Invalid reset token format',
  },
  newPassword: {
    required: true,
    type: 'string',
    minLength: 8,
    maxLength: 128,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  },
  confirmPassword: {
    required: true,
    type: 'string',
    match: 'newPassword',
    message: 'Passwords do not match',
  },
};

/**
 * Validation rules for change password
 */
export const ChangePasswordValidation = {
  currentPassword: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 128,
  },
  newPassword: {
    required: true,
    type: 'string',
    minLength: 8,
    maxLength: 128,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  },
  confirmPassword: {
    required: true,
    type: 'string',
    match: 'newPassword',
    message: 'Passwords do not match',
  },
  logoutOtherDevices: {
    required: false,
    type: 'boolean',
    default: false,
  },
};

/**
 * Validate forgot password data
 */
export function validateForgotPasswordDto(data: any): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.email) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(data.email)) {
    errors.email = 'Invalid email format';
  }

  if (process.env.REQUIRE_CAPTCHA_FOR_PASSWORD_RESET === 'true' && !data.captchaToken) {
    errors.captchaToken = 'CAPTCHA verification required';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

/**
 * Validate reset password data
 */
export function validateResetPasswordDto(data: any): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.token) {
    errors.token = 'Reset token is required';
  } else if (!ResetPasswordValidation.token.pattern.test(data.token)) {
    errors.token = ResetPasswordValidation.token.message;
  }

  if (!data.newPassword) {
    errors.newPassword = 'New password is required';
  } else if (data.newPassword.length < 8) {
    errors.newPassword = 'Password must be at least 8 characters';
  } else if (!ResetPasswordValidation.newPassword.pattern.test(data.newPassword)) {
    errors.newPassword = ResetPasswordValidation.newPassword.message;
  }

  if (!data.confirmPassword) {
    errors.confirmPassword = 'Password confirmation is required';
  } else if (data.newPassword !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

/**
 * Validate change password data
 */
export function validateChangePasswordDto(data: any): { valid: boolean; errors?: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.currentPassword) {
    errors.currentPassword = 'Current password is required';
  }

  if (!data.newPassword) {
    errors.newPassword = 'New password is required';
  } else if (data.newPassword.length < 8) {
    errors.newPassword = 'Password must be at least 8 characters';
  } else if (!ChangePasswordValidation.newPassword.pattern.test(data.newPassword)) {
    errors.newPassword = ChangePasswordValidation.newPassword.message;
  } else if (data.currentPassword === data.newPassword) {
    errors.newPassword = 'New password must be different from current password';
  }

  if (!data.confirmPassword) {
    errors.confirmPassword = 'Password confirmation is required';
  } else if (data.newPassword !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

/**
 * Transform forgot password data
 */
export function transformForgotPasswordDto(data: any): ForgotPasswordDto {
  return {
    email: data.email?.toLowerCase().trim(),
    captchaToken: data.captchaToken,
  };
}

/**
 * Transform reset password data
 */
export function transformResetPasswordDto(data: any): ResetPasswordDto {
  return {
    token: data.token,
    newPassword: data.newPassword,
    confirmPassword: data.confirmPassword,
  };
}

/**
 * Transform change password data
 */
export function transformChangePasswordDto(data: any): ChangePasswordDto {
  return {
    currentPassword: data.currentPassword,
    newPassword: data.newPassword,
    confirmPassword: data.confirmPassword,
    logoutOtherDevices: Boolean(data.logoutOtherDevices),
  };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function checkPasswordStrength(password: string): {
  score: number;
  feedback: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
} {
  let score = 0;
  const feedback: string[] = [];

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  else if (password.length < 12) feedback.push('Consider using a longer password');

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');

  if (/\d/.test(password)) score += 1;
  else feedback.push('Add numbers');

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
  else feedback.push('Add special characters');

  if (!/(.)\1{2,}/.test(password)) score += 1;
  else feedback.push('Avoid repeated characters');

  if (!/^(password|12345|qwerty|abc123)/i.test(password)) score += 1;
  else feedback.push('Avoid common passwords');

  let strength: 'weak' | 'fair' | 'good' | 'strong';
  if (score <= 3) strength = 'weak';
  else if (score <= 5) strength = 'fair';
  else if (score <= 7) strength = 'good';
  else strength = 'strong';

  return { score, feedback, strength };
}
