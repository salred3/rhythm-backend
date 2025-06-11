export class JwtStrategy {
  verify(token: string): boolean {
    // TODO: Implement real JWT verification
    return !!token;
  }
}
