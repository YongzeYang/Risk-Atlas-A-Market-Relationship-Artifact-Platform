import { scryptSync, timingSafeEqual } from 'node:crypto';

import { prisma } from '../lib/prisma.js';
import { ANALYSIS_INVITE_HEADER_NAME } from '../contracts/build-runs.js';
import { ServiceError } from '../lib/service-error.js';

export async function validateInviteCode(code: string): Promise<boolean> {
  if (!code || typeof code !== 'string') {
    return false;
  }

  const inviteCodes = await prisma.inviteCode.findMany({
    where: { active: true }
  });

  for (const invite of inviteCodes) {
    const separatorIndex = invite.codeHash.indexOf(':');
    if (separatorIndex === -1) continue;

    const salt = invite.codeHash.slice(0, separatorIndex);
    const storedHash = invite.codeHash.slice(separatorIndex + 1);

    const candidateHash = scryptSync(code, salt, 64).toString('hex');

    if (
      candidateHash.length === storedHash.length &&
      timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(storedHash, 'hex'))
    ) {
      if (invite.usesLeft !== null) {
        if (invite.usesLeft <= 0) continue;
        await prisma.inviteCode.update({
          where: { id: invite.id },
          data: { usesLeft: invite.usesLeft - 1 }
        });
      }
      return true;
    }
  }

  return false;
}

export async function requireInviteCodeHeader(
  headers: Record<string, string | string[] | undefined>
): Promise<void> {
  const headerValue = headers[ANALYSIS_INVITE_HEADER_NAME];
  const inviteCode = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!inviteCode || inviteCode.trim().length === 0) {
    throw new ServiceError(403, 'Invite code is required for analysis requests.');
  }

  const validInvite = await validateInviteCode(inviteCode.trim());
  if (!validInvite) {
    throw new ServiceError(403, 'Invalid invite code.');
  }
}
