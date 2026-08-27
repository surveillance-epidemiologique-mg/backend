import { PartialType } from '@nestjs/mapped-types';
import { CreateRegleAlerteDto } from './create-regle-alerte.dto';

export class UpdateRegleAlerteDto extends PartialType(CreateRegleAlerteDto) {}
