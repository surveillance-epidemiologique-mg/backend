import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaladiesService } from './maladies.service';
import { CreateMaladieDto } from './dto/create-maladie.dto';
import { UpdateMaladieDto } from './dto/update-maladie.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';

@ApiTags('maladies')
@ApiBearerAuth()
@Controller('maladies')
export class MaladiesController {
  constructor(private readonly maladiesService: MaladiesService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Lister les maladies du dictionnaire' })
  list() {
    return this.maladiesService.list();
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Post()
  @ApiOperation({ summary: 'Ajouter une maladie' })
  create(@Body() dto: CreateMaladieDto) {
    return this.maladiesService.create(dto);
  }

  @Roles(ROLES.ADMINISTRATEUR)
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une maladie' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaladieDto) {
    return this.maladiesService.update(id, dto);
  }
}
