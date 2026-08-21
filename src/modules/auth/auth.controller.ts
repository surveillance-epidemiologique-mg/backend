import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
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
    const result = await this.authService.login(dto);
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('activate')
  @ApiOperation({ summary: "Activation du compte via le lien d'activation" })
  async activate(
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ActivateAccountDto,
  ) {
    const result = await this.authService.activateAccount(dto);
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
    const result = await this.authService.changePassword(userId, dto);
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déconnexion' })
  logout(@Res({ passthrough: true }) res: Response) {
    const cookieName =
      this.configService.get<string>('JWT_COOKIE_NAME') ?? 'access_token';
    res.clearCookie(cookieName, { path: '/' });
    return { success: true };
  }

  private setAuthCookie(res: Response, token: string) {
    const cookieName =
      this.configService.get<string>('JWT_COOKIE_NAME') ?? 'access_token';
    const maxAgeSeconds =
      this.configService.get<number>('JWT_EXPIRES_IN') ?? 86400;

    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeSeconds * 1000,
      path: '/',
    });
  }
}
