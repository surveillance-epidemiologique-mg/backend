import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CarteQueryDto } from './carte-query.dto';

describe('Map disease query', () => {
  it('accepts all-disease requests and parses a positive disease id', async () => {
    expect(await validate(new CarteQueryDto())).toHaveLength(0);
    const query = plainToInstance(CarteQueryDto, { id_maladie: '12' });
    expect(query.id_maladie).toBe(12);
    expect(await validate(query)).toHaveLength(0);
  });
  it.each(['', '0', '-1', '1.2', 'NaN', 'abc', '2147483648', null, ['1', '2']])(
    'rejects malformed disease ids (%p) instead of exposing all cases',
    async (value) => {
      expect(
        (await validate(plainToInstance(CarteQueryDto, { id_maladie: value })))
          .length,
      ).toBeGreaterThan(0);
    },
  );
  it('preserves the old disease alias and rejects invalid diagnosis statuses', async () => {
    expect(
      await validate(
        plainToInstance(CarteQueryDto, { maladieId: '3', statut: 'Confirme' }),
      ),
    ).toHaveLength(0);
    expect(
      (await validate(plainToInstance(CarteQueryDto, { statut: 'anything' })))
        .length,
    ).toBeGreaterThan(0);
  });
});
