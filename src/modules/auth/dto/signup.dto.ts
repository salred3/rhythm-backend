export interface SignupDto {
  email: string;
  password: string;
  name: string;
  username?: string;
  termsAccepted?: boolean;
  marketingConsent?: boolean;
  referralCode?: string;
  timezone?: string;
  language?: string;
}

/**
 * Validation rules for signup
 */
export const SignupValidation = {
  email: {
    required: true,
    type: 'email',
    maxLength: 255,
    transform: (value: string) => value.toLowerCase().trim(),
  },
  password: {
    required: true,
    type: 'string',
    minLength: 8,
    maxLength: 128,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  },
  name: {
    required: true,
    type: 'string',
    minLength: 2,
    maxLength: 100,
    transform: (value: string) => value.trim(),
  },
  username: {
    required: false,
    type: 'string',
    minLength: 3,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9_-]+$/,
    message: 'Username can only contain letters, numbers, underscores, and hyphens',
    transform: (value: string) => value?.toLowerCase().trim(),
  },
  termsAccepted: {
    required: true,
    type: 'boolean',
    value: true,
    message: 'You must accept the terms of service',
  },
  marketingConsent: {
    required: false,
    type: 'boolean',
    default: false,
  },
  referralCode: {
    required: false,
    type: 'string',
    maxLength: 20,
    transform: (value: string) => value?.toUpperCase().trim(),
  },
  timezone: {
    required: false,
    type: 'string',
    default: 'UTC',
    enum: Intl.supportedValuesOf('timeZone'),
  },
  language: {
    required: false,
    type: 'string',
    default: 'en',
    enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'],
  },
};

/**
 * Validate signup data
 */
export function validateSignupDto(data: any): { valid: boolean; errors?: Record<string, string> } {
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
  } else if (data.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  } else if (!SignupValidation.password.pattern.test(data.password)) {
    errors.password = SignupValidation.password.message;
  }

  // Name validation
  if (!data.name) {
    errors.name = 'Name is required';
  } else if (data.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }

  // Username validation (optional)
  if (data.username) {
    if (data.username.length < 3 || data.username.length > 30) {
      errors.username = 'Username must be between 3 and 30 characters';
    } else if (!SignupValidation.username.pattern.test(data.username)) {
      errors.username = SignupValidation.username.message;
    }
  }

  // Terms acceptance
  if (!data.termsAccepted) {
    errors.termsAccepted = 'You must accept the terms of service';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

/**
 * Transform signup data
 */
export function transformSignupDto(data: any): SignupDto {
  return {
    email: data.email?.toLowerCase().trim(),
    password: data.password,
    name: data.name?.trim(),
    username: data.username?.toLowerCase().trim(),
    termsAccepted: Boolean(data.termsAccepted),
    marketingConsent: Boolean(data.marketingConsent),
    referralCode: data.referralCode?.toUpperCase().trim(),
    timezone: data.timezone || 'UTC',
    language: data.language || 'en',
  };
}

/**
 * Email validation helper
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
