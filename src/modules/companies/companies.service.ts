import { CreateCompanyDto } from './dto/create-company.dto';

export class CompaniesService {
  private companies: any[] = [];

  async create(dto: CreateCompanyDto) {
    const newCompany = { id: Date.now().toString(), ...dto };
    this.companies.push(newCompany);
    return newCompany;
  }

  async findAll() {
    return this.companies;
  }
}
