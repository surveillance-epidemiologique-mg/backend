import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(ROLES.ADMINISTRATEUR)
  @Post('invite')
  @ApiOperation({ summary: 'Inviter un utilisateur' })
  invite(@CurrentUser('id') userId: number, @Body() dto: InviteUserDto) {
    return this.usersService.invite(userId, dto);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Get()
  @ApiOperation({ summary: 'Lister les utilisateurs' })
  listUsers() {
    return this.usersService.listUsers();
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un utilisateur' })
  update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(userId, id, dto);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Post(':id/resend-invitation')
  @ApiOperation({ summary: "Renvoyer l'e-mail d'invitation" })
  resendInvitation(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.resendInvitation(userId, id);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Activer ou désactiver un utilisateur' })
  setStatus(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.usersService.setUserStatus(userId, id, dto.isActive);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un utilisateur (sans historique lié)' })
  remove(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.remove(userId, id);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Get('roles')
  @ApiOperation({ summary: 'Lister les rôles' })
  listRoles() {
    return this.usersService.listRoles();
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Get('centres')
  @ApiOperation({ summary: 'Lister les centres de santé' })
  listCentres() {
    return this.usersService.listCentres();
  }
}
