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
import { CentresService } from './centres.service';
import { CreateCentreDto } from './dto/create-centre.dto';
import { UpdateCentreDto } from './dto/update-centre.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';

@ApiTags('centres')
@ApiBearerAuth()
@Controller('centres')
export class CentresController {
  constructor(private readonly centresService: CentresService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les centres de santé' })
  list() {
    return this.centresService.list();
  }

  @Roles(ROLES.MEDECIN, ROLES.ADMINISTRATEUR)
  @Get('zones')
  @ApiOperation({ summary: 'Lister les zones administratives' })
  listZones() {
    return this.centresService.listZones();
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Post()
  @ApiOperation({ summary: 'Ajouter un centre de santé' })
  create(@Body() dto: CreateCentreDto) {
    return this.centresService.create(dto);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un centre de santé' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCentreDto) {
    return this.centresService.update(id, dto);
  }
}
