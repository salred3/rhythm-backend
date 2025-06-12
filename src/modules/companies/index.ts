// Main module exports
export { companiesRouter } from './companies.routes';
export { CompaniesController } from './companies.controller';
export { CompaniesService } from './companies.service';
export { MembersService } from './members.service';
export { InvitationsService } from './invitations.service';

// DTOs
export { 
  CreateCompanyDto, 
  UpdateCompanyDto,
  UpdateCompanySettingsDto,
  CompanySize,
  Industry
} from './dto/create-company.dto';

export { 
  InviteMemberDto,
  BulkInviteMembersDto,
  AcceptInvitationDto,
  DeclineInvitationDto,
  MemberRole
} from './dto/invite-member.dto';

export { 
  UpdateRoleDto,
  TransferOwnershipDto,
  BulkUpdateRolesDto
} from './dto/update-role.dto';

// Types
export type { MemberRole, MemberStatus } from './members.service';

// Repositories (for testing or advanced use)
export { CompaniesRepository } from './repositories/companies.repository';
export { MembersRepository } from './repositories/members.repository';
export { InvitationsRepository } from './repositories/invitations.repository';
