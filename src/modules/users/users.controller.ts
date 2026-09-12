import {
  Body,
  Controller,
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
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(ROLES.ADMINISTRATEUR)
  @Post('invite')
  @ApiOperation({
    summary:
      'Inviter un utilisateur (médecin ou laboratoire), validé par le mot de passe de l’administrateur',
  })
  invite(
    @CurrentUser('id') adminId: number,
    @Body() dto: InviteUserDto,
  ) {
    return this.usersService.invite(adminId, dto);
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Activer ou désactiver un utilisateur' })
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.usersService.setUserStatus(id, dto.isActive);
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
