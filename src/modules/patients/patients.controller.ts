import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';

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
}
