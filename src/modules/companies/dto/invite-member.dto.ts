import { 
  IsEmail, 
  IsEnum, 
  IsOptional, 
  IsString, 
  MaxLength,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize
} from 'class-validator';

export enum MemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  GUEST = 'guest'
}

/**
 * DTO for inviting a single team member
 */
export class InviteMemberDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsEnum(MemberRole, { 
    message: 'Role must be one of: owner, admin, member, or guest' 
  })
  role: MemberRole;

  @IsOptional()
  @IsString()
  @MaxLength(500, { 
    message: 'Personal message must not exceed 500 characters' 
  })
  message?: string;
}

/**
 * DTO for bulk inviting team members
 */
export class BulkInviteMembersDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one email is required' })
  @ArrayMaxSize(50, { message: 'Cannot invite more than 50 members at once' })
  @IsEmail({}, { each: true, message: 'All emails must be valid' })
  emails: string[];

  @IsEnum(MemberRole, { 
    message: 'Role must be one of: owner, admin, member, or guest' 
  })
  role: MemberRole;

  @IsOptional()
  @IsString()
  @MaxLength(500, { 
    message: 'Personal message must not exceed 500 characters' 
  })
  message?: string;
}

/**
 * DTO for accepting an invitation
 */
export class AcceptInvitationDto {
  @IsString()
  token: string;
}

/**
 * DTO for declining an invitation
 */
export class DeclineInvitationDto {
  @IsString()
  token: string;
}

