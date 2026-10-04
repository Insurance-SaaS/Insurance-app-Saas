import { AiImageAnalysisService } from './ai-image-analysis.service';

describe('AiImageAnalysisService', () => {
  const client = { analyzeImageWithText: jest.fn() };
  const service = new AiImageAnalysisService(client as any);
  const photo = { filename: 'degats.jpg', mimetype: 'image/jpeg', buffer: Buffer.alloc(1), base64: 'AA==' };
  const answer = (content: string) => client.analyzeImageWithText.mockResolvedValue({ content });
  const promptUsed = () => String(client.analyzeImageWithText.mock.calls[0][0]);

  beforeEach(() => jest.clearAllMocks());

  describe('reading the assessment from the model answer', () => {
    it('takes the fenced JSON block', async () => {
      answer('Le pare-choc est enfoncé.\n```json\n{"damagedParts":["pare-choc"],"severity":"moderate"}\n```');

      expect(await service.analyze(photo, 'sinistre_auto', 'accident')).toMatchObject({
        filename: 'degats.jpg',
        damagedParts: ['pare-choc'],
        severity: 'moderate',
      });
    });

    it('takes the last object that names the damaged parts when there is no fence', async () => {
      answer('Exemple: {"damagedParts":["x"]} puis le résultat {"affectedAreas":["toit","mur"]} fin');

      expect((await service.analyze(photo)).damagedParts).toEqual(['toit', 'mur']);
    });

    it('takes the outermost object otherwise', async () => {
      answer('Résultat: {"severity":"minor","details":{"zone":"avant"}} voilà');

      expect(await service.analyze(photo)).toMatchObject({ severity: 'minor', damagedParts: [] });
    });

    it('falls back to part names found in the text, once each', async () => {
      answer('Le capot avant est plié, le phare gauche est cassé. Le capot avant devra être remplacé.');

      expect((await service.analyze(photo, 'sinistre_auto', 'accident')).damagedParts).toEqual([
        'capot avant',
        'phare gauche',
      ]);
    });

    it('returns an empty assessment for JSON that does not parse', async () => {
      answer('```json\n{"damagedParts": ["capot",}\n```');

      expect(await service.analyze(photo)).toMatchObject({ damagedParts: [], severity: null });
    });

    it('reports a provider failure by its type instead of throwing', async () => {
      client.analyzeImageWithText.mockRejectedValue({ type: 'TIMEOUT_ERROR' });

      expect(await service.analyze(photo)).toMatchObject({ damagedParts: [], error: 'TIMEOUT_ERROR' });
    });
  });

  describe('choosing what to look for', () => {
    it.each([
      ['sinistre_auto', 'accident', 'CAR ACCIDENT'],
      ['sinistre_auto', 'Collision arrière', 'CAR ACCIDENT'],
      ['sinistre_habitation', 'vol', /burglary|cambriolage|break-in/i],
      ['sinistre_auto', 'incendie du moteur', /fire/i],
      ['sinistre_habitation', "endommage d'eau", /water/i],
    ])('%s / %s', async (conversationType, claimType, expected) => {
      answer('{}');

      await service.analyze(photo, conversationType, claimType);

      expect(promptUsed()).toMatch(expected);
    });

    it('goes by the conversation when the claim type says nothing', async () => {
      answer('{}');

      await service.analyze(photo, 'sinistre_auto', 'constructor');

      expect(promptUsed()).toMatch('CAR ACCIDENT');
    });
  });
});
