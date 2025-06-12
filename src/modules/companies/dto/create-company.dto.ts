import { IsString, IsOptional, IsEmail, IsUrl, IsEnum, MinLength, MaxLength, IsHexColor } from 'class-validator';

export enum CompanySize {
  SOLO = 'solo',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  ENTERPRISE = 'enterprise'
}

export enum Industry {
  TECHNOLOGY = 'technology',
  FINANCE = 'finance',
  HEALTHCARE = 'healthcare',
  EDUCATION = 'education',
  RETAIL = 'retail',
  MANUFACTURING = 'manufacturing',
  CONSULTING = 'consulting',
  MEDIA = 'media',
  NONPROFIT = 'nonprofit',
  OTHER = 'other'
}

/**
 * DTO for creating a new company
 */
export class CreateCompanyDto {
  @IsString()
  @MinLength(2, { message: 'Company name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Company name must not exceed 100 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;

  @IsOptional()
  @IsEnum(Industry, { message: 'Invalid industry selection' })
  industry?: Industry;

  @IsOptional()
  @IsEnum(CompanySize, { message: 'Invalid company size' })
  size?: CompanySize;

  @IsOptional()
  @IsUrl({}, { message: 'Invalid website URL' })
  website?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Invalid logo URL' })
  logo?: string;

  @IsOptional()
  @IsHexColor({ message: 'Brand color must be a valid hex color' })
  brandColor?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

/**
 * DTO for updating company details
 */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Company name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Company name must not exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;

  @IsOptional()
  @IsEnum(Industry, { message: 'Invalid industry selection' })
  industry?: Industry;

  @IsOptional()
  @IsEnum(CompanySize, { message: 'Invalid company size' })
  size?: CompanySize;

  @IsOptional()
  @IsUrl({}, { message: 'Invalid website URL' })
  website?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Invalid logo URL' })
  logo?: string;

  @IsOptional()
  @IsHexColor({ message: 'Brand color must be a valid hex color' })
  brandColor?: string;
}

/**
 * DTO for company settings
 */
export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  workingHours?: {
    start: string;
    end: string;
  };

  @IsOptional()
  workingDays?: string[];

  @IsOptional()
  autoSchedulingEnabled?: boolean;

  @IsOptional()
  requireApprovals?: boolean;

  @IsOptional()
  allowGuestAccess?: boolean;

  @IsOptional()
  memberCanInvite?: boolean;

  @IsOptional()
  @IsHexColor()
  brandColor?: string;

  @IsOptional()
  aiUsageLimit?: number;

  @IsOptional()
  currency?: string;

  @IsOptional()
  fiscalYearStart?: string;

  @IsOptional()
  defaultTaskDuration?: number;

  @IsOptional()
  weekStartsOn?: number;
}

