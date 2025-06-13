import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain, body, param, query } from 'express-validator';
import { InvalidInputException, ValidationException } from '../exceptions/business.exception';

export class ValidationUtil {
  static validate(validations: ValidationChain[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      await Promise.all(validations.map(validation => validation.run(req)));
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map(error => ({
          field: error.param,
          message: error.msg,
          value: error.value
        }));
        next(new ValidationException('Validation failed', formattedErrors));
        return;
      }
      next();
    };
  }

  static readonly common = {
    email: () => body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email address'),

    password: () => body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number and special character'),

    uuid: (field: string) => param(field)
      .isUUID()
      .withMessage(`Invalid ${field} format`),

    mongoId: (field: string) => param(field)
      .isMongoId()
      .withMessage(`Invalid ${field} format`),

    pagination: () => [
      query('page')
        .optional()
        .isInt({ min: 1 })
        .toInt()
        .withMessage('Page must be a positive integer'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .toInt()
        .withMessage('Limit must be between 1 and 100')
    ],

    dateRange: () => [
      query('startDate')
        .optional()
        .isISO8601()
        .toDate()
        .withMessage('Invalid start date format'),
      query('endDate')
        .optional()
        .isISO8601()
        .toDate()
        .withMessage('Invalid end date format')
        .custom((endDate, { req }) => {
          if (req.query?.startDate && endDate < req.query.startDate) {
            throw new Error('End date must be after start date');
          }
          return true;
        })
    ],

    phone: (field = 'phone') => body(field)
      .optional()
      .isMobilePhone('any')
      .withMessage('Invalid phone number'),

    url: (field = 'url') => body(field)
      .optional()
      .isURL({ protocols: ['http', 'https'] })
      .withMessage('Invalid URL'),

    timezone: (field = 'timezone') => body(field)
      .optional()
      .isIn(Intl.supportedValuesOf('timeZone'))
      .withMessage('Invalid timezone')
  };

  static isStrongPassword(password: string): boolean {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return (
      password.length >= minLength &&
      hasUpperCase &&
      hasLowerCase &&
      hasNumbers &&
      hasSpecialChar
    );
  }

  static isValidUsername(username: string): boolean {
    const regex = /^[a-zA-Z0-9_-]{3,30}$/;
    return regex.test(username);
  }

  static isValidPhoneNumber(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  static isValidCreditCard(cardNumber: string): boolean {
    const cleaned = cardNumber.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(cleaned)) {
      return false;
    }
    let sum = 0;
    let isEven = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned.charAt(i), 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  }

  static isValidPostalCode(postalCode: string, country = 'US'): boolean {
    const patterns: Record<string, RegExp> = {
      US: /^\d{5}(-\d{4})?$/,
      CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
      UK: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
      DE: /^\d{5}$/,
      FR: /^\d{5}$/,
      AU: /^\d{4}$/,
      JP: /^\d{3}-?\d{4}$/
    };
    const pattern = patterns[country];
    return pattern ? pattern.test(postalCode) : true;
  }

  static sanitize = {
    html: (input: string): string => {
      return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    },

    filename: (input: string): string => {
      return input
        .replace(/[^a-z0-9_\-.]/gi, '_')
        .replace(/_{2,}/g, '_')
        .toLowerCase();
    },

    alphanumeric: (input: string): string => {
      return input.replace(/[^a-z0-9]/gi, '');
    },

    numeric: (input: string): string => {
      return input.replace(/[^0-9]/g, '');
    },

    trim: (input: string): string => {
      return input.trim().replace(/\s+/g, ' ');
    },

    lowercase: (input: string): string => {
      return input.toLowerCase().trim();
    },

    uppercase: (input: string): string => {
      return input.toUpperCase().trim();
    }
  };

  static businessRules = {
    taskTitle: () => body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Task title must be between 1 and 200 characters'),

    taskDescription: () => body('description')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Task description must not exceed 5000 characters'),

    taskPriority: () => body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Invalid priority level'),

    taskStatus: () => body('status')
      .optional()
      .isIn(['todo', 'in_progress', 'review', 'done', 'cancelled'])
      .withMessage('Invalid task status'),

    companyName: () => body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Company name must be between 2 and 100 characters'),

    projectName: () => body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Project name must be between 2 and 100 characters'),

    duration: () => body('duration')
      .matches(/^(\d+h)?(\s*\d+m)?$/)
      .withMessage('Invalid duration format. Use format like "2h 30m"'),

    workHours: () => [
      body('workHours.start')
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .withMessage('Invalid start time format. Use HH:mm'),
      body('workHours.end')
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .withMessage('Invalid end time format. Use HH:mm')
        .custom((end, { req }) => {
          if (req.body?.workHours?.start && end <= req.body.workHours.start) {
            throw new Error('End time must be after start time');
          }
          return true;
        })
    ]
  };

  static async validateUniqueEmail(email: string, userId?: string): Promise<boolean> {
    return true;
  }

  static validatePasswordMatch(password: string, confirmPassword: string): boolean {
    return password === confirmPassword;
  }

  static validateDateRange(startDate: Date, endDate: Date, maxDays?: number): boolean {
    if (endDate < startDate) {
      return false;
    }
    if (maxDays) {
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= maxDays;
    }
    return true;
  }

  static validateFile(file: Express.Multer.File, options: {
    maxSize?: number;
    allowedTypes?: string[];
    allowedExtensions?: string[];
  }): { valid: boolean; error?: string } {
    if (options.maxSize && file.size > options.maxSize) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${options.maxSize} bytes`
      };
    }
    if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: `File type ${file.mimetype} is not allowed`
      };
    }
    if (options.allowedExtensions) {
      const extension = file.originalname.split('.').pop()?.toLowerCase();
      if (!extension || !options.allowedExtensions.includes(extension)) {
        return {
          valid: false,
          error: `File extension .${extension} is not allowed`
        };
      }
    }
    return { valid: true };
  }
}

