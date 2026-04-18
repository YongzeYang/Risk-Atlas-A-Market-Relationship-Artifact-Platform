import { scryptSync, timingSafeEqual } from 'node:crypto';

import { prisma } from '../lib/prisma.js';

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
