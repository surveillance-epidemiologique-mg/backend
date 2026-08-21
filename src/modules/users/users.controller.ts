import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(ROLES.ADMINISTRATEUR)
  @Post('invite')
  @ApiOperation({ summary: 'Inviter un utilisateur (médecin ou laboratoire)' })
  invite(@Body() dto: InviteUserDto) {
    return this.usersService.invite(dto);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Get()
  @ApiOperation({ summary: 'Lister les utilisateurs' })
  listUsers() {
    return this.usersService.listUsers();
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
