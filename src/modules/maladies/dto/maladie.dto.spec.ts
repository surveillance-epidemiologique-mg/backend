import { validate } from 'class-validator';
import { CreateMaladieDto } from './create-maladie.dto';
import { UpdateMaladieDto } from './update-maladie.dto';

describe('Disease threshold validation', () => {
  it('requires both thresholds when creating a disease', async () => {
    const dto = Object.assign(new CreateMaladieDto(), { name: 'Test' });
    expect((await validate(dto)).map((e) => e.property).sort()).toEqual([
      'alertThresholdCentre',
      'alertThresholdRegion',
    ]);
  });
  it.each([null, 0, -1, 1.5, '3', 2147483648])(
    'rejects invalid threshold %p on updates',
    async (value) => {
      const dto = Object.assign(new UpdateMaladieDto(), {
        alertThresholdCentre: value,
        alertThresholdRegion: value,
      });
      expect((await validate(dto)).map((e) => e.property).sort()).toEqual([
        'alertThresholdCentre',
        'alertThresholdRegion',
      ]);
    },
  );
  it('allows independent integer thresholds and partial updates', async () => {
    expect(
      await validate(
        Object.assign(new CreateMaladieDto(), {
          name: 'Test',
          alertThresholdCentre: 10,
          alertThresholdRegion: 2,
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        Object.assign(new UpdateMaladieDto(), { alertThresholdRegion: 6 }),
      ),
    ).toHaveLength(0);
  });
});
