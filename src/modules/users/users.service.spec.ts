import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { UsersService } from './users.service';

describe('UsersService invitation renewal', () => {
  const token = 'a'.repeat(64);
  const user = {
    id: 12,
    name: 'Agent test',
    email: 'agent@example.test',
    resetToken: token,
    invitationExpiresAt: new Date(Date.now() - 60_000),
    temporaryPassword: true,
    isActive: true,
  };

  function setup() {
    const findUnique = jest.fn();
    const updateMany = jest
      .fn<
        Promise<{ count: number }>,
        [
          {
            data: {
              resetToken: string | null;
              invitationExpiresAt: Date | null;
            };
          },
        ]
      >()
      .mockResolvedValue({ count: 1 });
    const sendActivationEmail = jest
      .fn<
        Promise<void>,
        [{ to: string; name: string; activationLink: string }]
      >()
      .mockResolvedValue(undefined);
    const prisma = { utilisateur: { findUnique, updateMany } };
    const config = { get: jest.fn().mockReturnValue('http://localhost:3000') };
    const email = { sendActivationEmail };
    const service = new UsersService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      email as unknown as EmailService,
    );
    return { service, findUnique, updateMany, sendActivationEmail };
  }

  it('remplace un lien expiré et envoie un nouveau jeton valable 7 jours', async () => {
    const { service, findUnique, updateMany, sendActivationEmail } = setup();
    findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

    const result = await service.resendExpiredInvitationByToken(token);

    expect(result.success).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const replacement = updateMany.mock.calls[0][0].data;
    expect(replacement.resetToken).not.toBe(token);
    expect(replacement.invitationExpiresAt?.getTime()).toBeGreaterThan(
      Date.now() + (7 * 24 - 1) * 60 * 60 * 1000,
    );
    const sent = sendActivationEmail.mock.calls[0][0];
    expect(sent.to).toBe(user.email);
    expect(sent.activationLink).toContain(replacement.resetToken);
  });

  it('ne renvoie pas un lien encore valide', async () => {
    const { service, findUnique, updateMany, sendActivationEmail } = setup();
    findUnique.mockResolvedValue({
      ...user,
      invitationExpiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.resendExpiredInvitationByToken(token);

    expect(result.success).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
    expect(sendActivationEmail).not.toHaveBeenCalled();
  });

  it("restaure l'ancien jeton si l'envoi échoue", async () => {
    const { service, findUnique, updateMany, sendActivationEmail } = setup();
    findUnique.mockResolvedValue(user);
    sendActivationEmail.mockRejectedValue(new Error('E-mail indisponible'));

    await expect(service.resendExpiredInvitationByToken(token)).rejects.toThrow(
      'E-mail indisponible',
    );
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[1][0].data).toEqual({
      resetToken: token,
      invitationExpiresAt: user.invitationExpiresAt,
    });
  });
});
