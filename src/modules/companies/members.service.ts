export class MembersService {
  private members: any[] = [];

  async addMember(companyId: string, email: string) {
    const member = { id: Date.now().toString(), companyId, email };
    this.members.push(member);
    return member;
  }
}
