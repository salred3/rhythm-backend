import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

export class AuthService {
  async login(credentials: LoginDto) {
    // TODO: check credentials against database
    return { token: `token-for-${credentials.email}` };
  }

  async signup(details: SignupDto) {
    // TODO: create user record in database
    return { id: Date.now().toString(), ...details };
  }
}
