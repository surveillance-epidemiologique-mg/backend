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
import { CreateAnalyseDto } from './dto/create-analyse.dto';
import { ListCasesQueryDto } from './dto/list-cases-query.dto';
import { UpdateAnalyseResultDto } from './dto/update-analyse-result.dto';
import { ValidateCaseDto } from './dto/validate-case.dto';
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
  laboratoire(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCasesQueryDto,
  ) {
    return this.casService.laboratoirePending(user, query);
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

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Post(':id/analyses')
  @ApiOperation({
    summary:
      "Demander une analyse pour un cas (médecin) ou ajouter une analyse complémentaire (laboratoire)",
  })
  requestAnalyse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAnalyseDto,
  ) {
    return this.casService.createAnalyse(id, dto);
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get(':id/analyses')
  @ApiOperation({ summary: "Lister les analyses d'un cas" })
  listAnalyses(@Param('id', ParseIntPipe) id: number) {
    return this.casService.listAnalyses(id);
  }

  @Roles(ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Patch('analyses/:analyseId/result')
  @ApiOperation({
    summary: "Renseigner le résultat d'une analyse (statut global du cas optionnel)",
  })
  realizeAnalyse(
    @CurrentUser('id') laboratoryId: number,
    @Param('analyseId', ParseIntPipe) analyseId: number,
    @Body() dto: UpdateAnalyseResultDto,
  ) {
    return this.casService.realizeAnalyse(laboratoryId, analyseId, dto);
  }

  @Roles(ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Post(':id/validate')
  @ApiOperation({
    summary:
      'Confirmer ou invalider un cas (dès qu’au moins une analyse est réalisée)',
  })
  validate(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateCaseDto,
  ) {
    return this.casService.validateCase(userId, id, dto);
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get(':id')
  @ApiOperation({
    summary:
      'Récupérer un cas par identifiant (Médecin limité à son centre)',
  })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.casService.findOne(user, id);
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
