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
import { SignalementsService } from './signalements.service';
import { CreateSignalementDto } from './dto/create-signalement.dto';
import { UpdateSignalementDto } from './dto/update-signalement.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

@ApiTags('signalements')
@ApiBearerAuth()
@Controller('signalements')
export class SignalementsController {
  constructor(private readonly signalementsService: SignalementsService) {}

  @Permissions(PERMISSIONS.SIGNALEMENT_READ)
  @Get('options')
  @ApiOperation({
    summary:
      'Référentiels du formulaire (maladies, régions, districts, établissements)',
  })
  options() {
    return this.signalementsService.options();
  }

  @Permissions(PERMISSIONS.SIGNALEMENT_CREATE)
  @Post()
  @ApiOperation({ summary: 'Créer un signalement (brouillon)' })
  create(@CurrentUser('id') userId: number, @Body() dto: CreateSignalementDto) {
    return this.signalementsService.create(userId, dto);
  }

  @Permissions(PERMISSIONS.SIGNALEMENT_READ)
  @Get()
  @ApiOperation({ summary: 'Lister les signalements selon le périmètre' })
  list(@CurrentUser('id') userId: number) {
    return this.signalementsService.list(userId);
  }

  @Permissions(PERMISSIONS.SIGNALEMENT_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Consulter un signalement' })
  findOne(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.signalementsService.findOne(userId, id);
  }

  @Permissions(PERMISSIONS.SIGNALEMENT_UPDATE)
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un signalement' })
  update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSignalementDto,
  ) {
    return this.signalementsService.update(userId, id, dto);
  }

  @Permissions(PERMISSIONS.SIGNALEMENT_SUBMIT)
  @Patch(':id/submit')
  @ApiOperation({
    summary: 'Soumettre un signalement (brouillon → en attente)',
  })
  submit(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.signalementsService.submit(userId, id);
  }

  @Permissions(PERMISSIONS.SIGNALEMENT_VALIDATE)
  @Patch(':id/validate')
  @ApiOperation({ summary: 'Valider un signalement (rôle national)' })
  validate(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.signalementsService.validate(userId, id);
  }

  @Permissions(PERMISSIONS.SIGNALEMENT_REJECT)
  @Patch(':id/reject')
  @ApiOperation({ summary: 'Rejeter un signalement (rôle national)' })
  reject(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.signalementsService.reject(userId, id);
  }
}
