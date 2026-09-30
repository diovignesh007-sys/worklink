import fp from 'fastify-plugin';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, AccessClaims } from '../lib/tokens.js';
import { unauthorized, forbidden } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: () => AccessClaims;
    optionalAuth: () => AccessClaims | null;
    requireAdmin: () => AccessClaims;
  }
}

export default fp(async (app) => {
  app.decorateRequest('auth', function (this: FastifyRequest): AccessClaims {
    const header = this.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    return verifyAccessToken(header.slice(7));
  });

  app.decorateRequest('optionalAuth', function (this: FastifyRequest): AccessClaims | null {
    const header = this.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      return verifyAccessToken(header.slice(7));
    } catch {
      return null;
    }
  });

  app.decorateRequest('requireAdmin', function (this: FastifyRequest): AccessClaims {
    const claims = this.auth();
    if (!claims.adm) throw forbidden('Admin access required');
    return claims;
  });
});
