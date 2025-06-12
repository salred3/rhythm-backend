import { IsEnum, IsNotEmpty } from 'class-validator';
import { MemberRole } from './invite-member.dto';

/**
 * DTO for updating a team member's role
 */
export class UpdateRoleDto {
  @IsNotEmpty({ message: 'Role is required' })
  @IsEnum(MemberRole, { 
    message: 'Role must be one of: owner, admin, member, or guest' 
  })
  role: MemberRole;
}

/**
 * DTO for transferring ownership
 */
export class TransferOwnershipDto {
  @IsNotEmpty({ message: 'New owner member ID is required' })
  newOwnerMemberId: string;
}

/**
 * DTO for bulk role updates
 */
export class BulkUpdateRolesDto {
  updates: {
    memberId: string;
    role: MemberRole;
  }[];
}

