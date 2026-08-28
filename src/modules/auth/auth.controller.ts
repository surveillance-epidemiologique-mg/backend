import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ActivateInfoDto } from './dto/activate-info.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { TempPasswordAllowed } from '../../common/decorators/temp-password-allowed.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Connexion et obtention du jeton JWT' })
  async login(
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LoginDto,
  ) {
    const result = await this.authService.login(dto, this.requestMeta(res));
    this.setAuthCookie(res, result.token, result.expiresIn);
    return result;
  }

  @Public()
  @Post('activate')
  @ApiOperation({ summary: "Activation du compte via le lien d'activation" })
  async activate(
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ActivateAccountDto,
  ) {
    const result = await this.authService.activateAccount(
      dto,
      this.requestMeta(res),
    );
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('activate-info')
  @ApiOperation({
    summary: "Vérifier un jeton d'activation et retourner l'adresse du compte",
  })
  activateInfo(@Body() dto: ActivateInfoDto) {
    return this.authService.activationInfo(dto.token);
  }

  @Public()
  @Post('resend-activation')
  @ApiOperation({
    summary: "Renvoyer un lien d'activation pour un compte en attente",
  })
  resendActivation(@Body() dto: ForgotPasswordDto) {
    return this.authService.resendActivation(dto.email);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Demande de réinitialisation du mot de passe' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({
    summary: 'Réinitialisation du mot de passe via le lien reçu',
  })
  async resetPassword(
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ResetPasswordDto,
  ) {
    const result = await this.authService.resetPassword(
      dto,
      this.requestMeta(res),
    );
    this.setAuthCookie(res, result.token);
    return result;
  }

  @TempPasswordAllowed()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer le profil de l’utilisateur connecté' })
  async me(@CurrentUser('id') userId: number) {
    return this.authService.getMe(userId);
  }

  @TempPasswordAllowed()
  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Changer le mot de passe' })
  async changePassword(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(
      userId,
      dto,
      this.requestMeta(res),
    );
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déconnexion' })
  async logout(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('jti') jti: string,
  ) {
    const cookieName =
      this.configService.get<string>('JWT_COOKIE_NAME') ?? 'access_token';
    await this.authService.logout(jti);
    res.clearCookie(cookieName, { path: '/' });
    return { success: true };
  }

  @TempPasswordAllowed()
  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Rafraîchir le jeton d'accès" })
  async refresh(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('id') userId: number,
  ) {
    const result = await this.authService.refresh(
      userId,
      this.requestMeta(res),
    );
    this.setAuthCookie(res, result.token);
    return result;
  }

  private requestMeta(res: Response) {
    return {
      ip: res.req.ip ?? null,
      userAgent: res.req.headers['user-agent'] ?? null,
    };
  }

  private setAuthCookie(res: Response, token: string, maxAgeSeconds?: number) {
    const cookieName =
      this.configService.get<string>('JWT_COOKIE_NAME') ?? 'access_token';
    const maxAge =
      maxAgeSeconds ??
      this.configService.get<number>('JWT_EXPIRES_IN') ??
      86400;

    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAge * 1000,
      path: '/',
    });
  }
}
