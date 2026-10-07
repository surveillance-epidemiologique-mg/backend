import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuthService } from './auth.service';

describe('AuthService activation invitation', () => {
  it('refuse un lien expiré sans modifier le compte', async () => {
    const prisma = {
      utilisateur: {
        findUnique: jest.fn().mockResolvedValue({
          id: 12,
          temporaryPassword: true,
          isActive: true,
          invitationExpiresAt: new Date(Date.now() - 1_000),
        }),
        updateMany: jest.fn(),
      },
    };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      {} as ConfigService,
      {} as EmailService,
    );

    await expect(
      service.activateAccount({ token: 'expired', newPassword: 'Secret123!' }),
    ).rejects.toThrow("Ce lien d'invitation a expiré");
    expect(prisma.utilisateur.updateMany).not.toHaveBeenCalled();
  });

  it('refuse un ancien jeton remplacé pendant le renvoi', async () => {
    const prisma = {
      utilisateur: {
        findUnique: jest.fn().mockResolvedValue({
          id: 12,
          temporaryPassword: true,
          isActive: true,
          invitationExpiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const config = { get: jest.fn().mockReturnValue(4) };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      config as unknown as ConfigService,
      {} as EmailService,
    );

    await expect(
      service.activateAccount({ token: 'ancien', newPassword: 'Secret123!' }),
    ).rejects.toThrow("Lien d'activation invalide ou expiré.");
    expect(prisma.utilisateur.updateMany).toHaveBeenCalledTimes(1);
  });
});
