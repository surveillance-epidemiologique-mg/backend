import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { AdminService } from './admin.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

class UpdateRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Permissions(PERMISSIONS.JOURNAL_READ)
  @Get('journal')
  @ApiOperation({ summary: 'Journal d’activité (permission journal:read)' })
  journal(
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.journal({
      action: action || undefined,
      userId: userId ? Number(userId) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Permissions(PERMISSIONS.SESSION_MANAGE)
  @Get('sessions')
  @ApiOperation({ summary: 'Sessions actives (permission session:manage)' })
  sessions() {
    return this.adminService.sessions();
  }

  @Permissions(PERMISSIONS.SESSION_MANAGE)
  @Patch('sessions/:id/revoke')
  @ApiOperation({ summary: 'Révoquer une session (permission session:manage)' })
  revokeSession(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.revokeSession(id);
  }

  @Permissions(PERMISSIONS.JOURNAL_READ)
  @Get('tentatives')
  @ApiOperation({
    summary: 'Tentatives de connexion (permission journal:read)',
  })
  tentatives(@Query('limit') limit?: string) {
    return this.adminService.tentatives(limit ? Number(limit) : undefined);
  }

  @Permissions(PERMISSIONS.ROLE_MANAGE)
  @Get('roles')
  @ApiOperation({ summary: 'Rôles et permissions (permission role:manage)' })
  roles() {
    return this.adminService.roles();
  }

  @Permissions(PERMISSIONS.ROLE_MANAGE)
  @Get('permissions')
  @ApiOperation({
    summary: 'Catalogue des permissions (permission role:manage)',
  })
  permissions() {
    return this.adminService.permissions();
  }

  @Permissions(PERMISSIONS.ROLE_MANAGE)
  @Patch('roles/:id/permissions')
  @ApiOperation({ summary: 'Attribuer des permissions à un rôle (admin)' })
  updateRolePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.adminService.updateRolePermissions(id, dto.permissionCodes);
  }
}
