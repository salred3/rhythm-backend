import { InviteMemberDto } from './dto/invite-member.dto';

export class InvitationsService {
  private invites: any[] = [];

  async invite(dto: InviteMemberDto) {
    const invitation = { id: Date.now().toString(), ...dto };
    this.invites.push(invitation);
    return invitation;
  }
}
