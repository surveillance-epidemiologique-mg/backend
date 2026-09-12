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
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Roles(ROLES.MEDECIN, ROLES.ADMINISTRATEUR)
  @Post()
  @ApiOperation({ summary: 'Enregistrer un patient anonyme' })
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get()
  @ApiOperation({ summary: 'Lister les patients anonymes' })
  list() {
    return this.patientsService.list();
  }

  @Roles(ROLES.MEDECIN, ROLES.LABORATOIRE, ROLES.ADMINISTRATEUR)
  @Get(':id')
  @ApiOperation({
    summary:
      'Détail d’un patient (zone de résidence + historique des cas). Médecin limité aux patients de son centre.',
  })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.patientsService.findOne(user, id);
  }

  @Roles(ROLES.MEDECIN, ROLES.ADMINISTRATEUR)
  @Patch(':id')
  @ApiOperation({
    summary:
      'Modifier un patient (name_patient, age, sexe). Médecin limité aux patients de son centre.',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(user, id, dto);
  }

  @Roles(ROLES.MEDECIN, ROLES.ADMINISTRATEUR)
  @Delete(':id')
  @ApiOperation({
    summary:
      'Supprimer un patient (Médecin limité à son centre, Admin tous ; bloqué si des cas y sont associés).',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.patientsService.remove(user, id);
  }
}