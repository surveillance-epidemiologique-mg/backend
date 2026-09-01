import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatutDiag } from '../../../generated/prisma/client';
import { CasService } from './cas.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { ListCasesQueryDto } from './dto/list-cases-query.dto';
import { UpdateResultDto } from './dto/update-result.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('cas')
@ApiBearerAuth()
@Controller('cas')
export class CasController {
  constructor(private readonly casService: CasService) {}

  @Roles(ROLES.MEDECIN, ROLES.ADMINISTRATEUR)
  @Post()
  @ApiOperation({ summary: 'Déclarer un cas suspect ou confirmé' })
  declare(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCaseDto,
  ) {
    return this.casService.declare(user, dto);
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get()
  @ApiOperation({
    summary:
      'Lister les cas (Admin/Labo : tous ; Médecin : uniquement ceux de son centre)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCasesQueryDto,
  ) {
    return this.casService.listForUser(user, query);
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('years')
  @ApiOperation({
    summary: 'Années disponibles de date_diagnostic (selon la visibilité du rôle)',
  })
  years(@CurrentUser() user: AuthenticatedUser) {
    return this.casService.listYears(user);
  }

  @Roles(ROLES.MEDECIN, ROLES.ADMINISTRATEUR)
  @Get('mes-cas')
  @ApiOperation({ summary: 'Mes cas déclarés (filtrés par statut)' })
  mesCas(
    @CurrentUser('id') userId: number,
    @Query('statut') statut?: StatutDiag,
  ) {
    return this.casService.mesCas(userId, statut);
  }

  @Roles(ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get('laboratoire')
  @ApiOperation({
    summary: 'Cas en attente (Suspect) pour le laboratoire',
  })
  laboratoire(@Query() query: ListCasesQueryDto) {
    return this.casService.laboratoirePending(query);
  }

  @Roles(ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Patch(':id/result')
  @ApiOperation({
    summary: 'Saisir le résultat biologique et basculer le statut',
  })
  updateResult(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateResultDto,
  ) {
    return this.casService.updateResult(userId, id, dto);
  }

  @Roles(ROLES.MEDECIN, ROLES.ADMINISTRATEUR)
  @Patch(':id/issue')
  @ApiOperation({ summary: "Mettre à jour l'issue clinique" })
  updateIssue(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIssueDto,
  ) {
    return this.casService.updateIssue(userId, id, dto);
  }
}
