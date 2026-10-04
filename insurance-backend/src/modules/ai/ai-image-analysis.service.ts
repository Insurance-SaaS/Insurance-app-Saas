import { Injectable, Logger } from '@nestjs/common';
import { ImageData } from './ai.constants';
import { fencedJsonBlock, OpenAIClientService, outermostJsonObject } from './openai-client.service';

type ClaimKind = 'accident' | 'fire' | 'water' | 'theft' | 'other';

/** Claim types as the forms name them. */
const CLAIM_KIND_BY_NAME = new Map<string, ClaimKind>([
  ['accident', 'accident'],
  ['feu', 'fire'],
  ["endommage d'eau", 'water'],
  ['dégât des eaux', 'water'],
  ['degat eau', 'water'],
  ['vol', 'theft'],
  ['autre_type', 'other'],
]);

/** For free text, the first kind one of whose words appears in it. */
const CLAIM_KIND_KEYWORDS: [ClaimKind, string[]][] = [
  ['accident', ['accident', 'collision']],
  ['fire', ['feu', 'fire', 'incendie']],
  ['water', ['eau', 'water']],
  ['theft', ['vol', 'theft']],
];

function claimKindOf(type: string): ClaimKind | null {
  return (
    CLAIM_KIND_BY_NAME.get(type) ??
    CLAIM_KIND_KEYWORDS.find(([, words]) => words.some((word) => type.includes(word)))?.[0] ??
    null
  );
}

const SIDES = ['avant', 'arrière', 'gauche', 'droit', 'droite'];

/** Words to look for in a description when the model returned no JSON: a part, optionally followed by its state. */
const PART_VOCABULARY: Record<string, { parts: string[]; states: string[] }> = {
  accident_auto: {
    parts: ['pare-choc', 'capot', 'porte', 'phare', 'aile', 'pare-brise', 'rétroviseur', 'coffre', 'toit', 'malle', 'grille', 'calandre', 'portière', 'carrosserie'],
    states: SIDES,
  },
  vol_auto: {
    parts: ['portière', 'serrure', 'vitre', 'rétroviseur', 'roue', 'capot', 'coffre', 'contact', 'colonne de direction', 'antivol', "système d'alarme"],
    states: ['forcé', 'cassé', 'endommagé', 'brisé'],
  },
  other_auto: {
    parts: ['carrosserie', 'peinture', 'pare-choc', 'porte', 'portière', 'capot', 'coffre', 'roue', 'jante', 'pneu', 'phare', 'rétroviseur', 'pare-brise', 'toit', 'aile'],
    states: SIDES,
  },
  incendie: {
    parts: ['moteur', 'habitacle', 'tableau de bord', 'sièges', 'câblage', 'carrosserie', 'capot', 'toit', 'cuisine', 'salon', 'chambre', 'combles', 'cave', 'électricité', 'murs', 'plafond', 'charpente'],
    states: ['brûlé', 'calciné', 'noirci', 'endommagé'],
  },
  degat_eau: {
    parts: ['plafond', 'mur', 'sol', 'plancher', 'cave', 'cuisine', 'salle de bain', 'toit', 'toiture', 'gouttière', 'tuyauterie', 'isolation'],
    states: ['humide', 'inondé', 'moisi', 'taché'],
  },
  property_accident: {
    parts: ['mur', 'porte', 'fenêtre', 'plafond', 'sol', 'plancher', 'escalier', 'balcon', 'clôture', 'portail', 'garage'],
    states: ['cassé', 'endommagé', 'fissuré'],
  },
  cambriolage: {
    parts: ['porte', 'fenêtre', 'serrure', 'volet', 'coffre', 'meuble', 'cadre'],
    states: ['forcé', 'cassé', 'endommagé'],
  },
};

/**
 * Looks at a photo of damage and returns a structured assessment: the damaged
 * parts or areas, severity, kind of damage. Stateless; nothing is stored here.
 */
@Injectable()
export class AiImageAnalysisService {
  private readonly logger = new Logger(AiImageAnalysisService.name);

  constructor(private readonly aiClient: OpenAIClientService) {}

  async analyze(
    imageData: ImageData,
    conversationType: string = 'general',
    sinistreType?: string,
  ): Promise<any> {
    try {
      const analysisContext = this.getAnalysisContext(conversationType, sinistreType);
      const analysisPrompt = this.getImageAnalysisPrompt(analysisContext);

      this.logger.log(`Analyzing image with context: ${analysisContext}`);

      const response = await this.aiClient.analyzeImageWithText(
        analysisPrompt,
        imageData.base64,
        imageData.mimetype,
        {
          temperature: 0.5,
          maxTokens: 1024,
        },
      );

      const extractedData = this.readAssessment(response.content, analysisContext);

      return {
        filename: imageData.filename,
        analysis: response.content,
        damagedParts: extractedData.damagedParts || extractedData.affectedAreas || [],
        severity: extractedData.severity || null,
        damageType: extractedData.damageType || null,
        estimatedCost: extractedData.estimatedCost || null,
        urgency: extractedData.urgency || null,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error('Image analysis error:', error);

      return {
        filename: imageData.filename,
        analysis: 'Image analysis unavailable',
        damagedParts: [],
        error: error.type || 'UNKNOWN_ERROR',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private getAnalysisContext(conversationType: string, sinistreType?: string): string {
    const home = conversationType === 'sinistre_habitation';
    const contexts: Record<ClaimKind, string> = {
      accident: home ? 'property_accident' : 'accident_auto',
      fire: 'incendie',
      water: 'degat_eau',
      theft: home ? 'cambriolage' : 'vol_auto',
      other: home ? 'property_damage' : 'other_auto',
    };

    const kind = sinistreType ? claimKindOf(sinistreType.toLowerCase().trim()) : null;
    if (kind) {
      return contexts[kind];
    }
    // No recognisable claim type: go by the conversation.
    if (conversationType === 'sinistre_auto') {
      return 'accident_auto';
    }
    return home ? 'property_damage' : 'general';
  }

  /**
   * Finds the JSON assessment in the model's answer: a fenced ```json block,
   * else the last object that names the damaged parts, else the outermost
   * object. With no JSON at all, falls back to spotting part names in the text.
   */
  private readAssessment(content: string, context: string): Record<string, any> {
    const partsObjects = content.match(/\{[^{}]*("damagedParts"|"affectedAreas")[^{}]*\}/g);
    const json = fencedJsonBlock(content) || partsObjects?.at(-1) || outermostJsonObject(content);

    if (!json) {
      this.logger.warn('No JSON structure found in image analysis response');
      const damagedParts = this.extractPartsFromText(content, context);
      return damagedParts.length > 0 ? { damagedParts } : {};
    }
    try {
      return JSON.parse(json) as Record<string, any>;
    } catch (error) {
      this.logger.error(`Failed to parse JSON from image analysis: ${(error as Error).message}`);
      return {};
    }
  }

  private extractPartsFromText(text: string, context: string): string[] {
    const { parts, states } = PART_VOCABULARY[context] ?? PART_VOCABULARY.accident_auto;
    const pattern = new RegExp(String.raw`(${parts.join('|')})\s*(${states.join('|')})?`, 'gi');

    const detected = new Set<string>();
    for (const match of text.matchAll(pattern)) {
      detected.add(match[0].trim());
    }
    return [...detected];
  }

  private getImageAnalysisPrompt(context: string): string {
    const prompts: Record<string, string> = {
      accident_auto: `Analyze this CAR ACCIDENT/COLLISION damage photo for insurance purposes.

You MUST provide your response in TWO parts:

PART 1 - FRENCH ANALYSIS (brief, 2-3 sentences):
Describe the visible damage in French.

PART 2 - JSON OUTPUT (MANDATORY):
After your analysis, you MUST include this EXACT JSON structure:

\`\`\`json
{
  "damagedParts": ["part1", "part2", "part3"],
  "severity": "minor|moderate|severe",
  "damageType": "collision|impact|scrape",
  "estimatedCost": "low|medium|high"
}
\`\`\`

CAR PARTS (use French names with position):
- "pare-choc avant/arrière" (bumper)
- "capot" (hood)
- "porte avant/arrière gauche/droite" (door)
- "phare avant gauche/droit" (headlight)
- "aile avant/arrière gauche/droite" (fender)
- "pare-brise" (windshield)
- "rétroviseur gauche/droit" (mirror)
- "coffre/malle" (trunk)
- "toit" (roof)
- "grille/calandre" (grille)
- "portière" (car door)

NOW ANALYZE THE IMAGE:`,

      vol_auto: `Analyze this VEHICLE THEFT damage photo for auto insurance.

PART 1 - FRENCH ANALYSIS (2-3 sentences):
Describe signs of forced entry or theft damage to the vehicle.

PART 2 - JSON OUTPUT (MANDATORY):
\`\`\`json
{
  "damagedParts": ["part1", "part2"],
  "severity": "minor|moderate|severe",
  "damageType": "forced_entry|vandalism|attempted_theft|theft",
  "entryPoint": "door|window|lock|ignition"
}
\`\`\`

AUTO THEFT DAMAGE (French):
- "portière forcée" (forced door)
- "serrure endommagée" (damaged lock)
- "vitre brisée" (broken window)
- "coffre forcé" (forced trunk)
- "colonne de direction" (steering column)
- "contact forcé" (forced ignition)
- "système d'alarme endommagé" (damaged alarm)
- "antivol cassé" (broken anti-theft)

NOW ANALYZE THE IMAGE:`,

      incendie: `Analyze this FIRE DAMAGE photo for insurance (auto or property).

PART 1 - FRENCH ANALYSIS (2-3 sentences):
Describe fire/smoke/heat damage visible in the image.

PART 2 - JSON OUTPUT (MANDATORY):
\`\`\`json
{
  "damagedParts": ["part1", "part2", "part3"],
  "severity": "minor|moderate|severe|total_loss",
  "damageType": "fire|smoke|heat|electrical_fire",
  "affectedArea": "specific_location"
}
\`\`\`

FIRE DAMAGE AREAS (French):

FOR AUTO:
- "moteur" (engine)
- "habitacle" (interior/cabin)
- "tableau de bord" (dashboard)
- "sièges" (seats)
- "câblage électrique" (electrical wiring)
- "carrosserie" (body)
- "capot" (hood)
- "toit" (roof)

FOR PROPERTY:
- "cuisine" (kitchen)
- "salon" (living room)
- "chambre" (bedroom)
- "combles" (attic)
- "cave" (basement)
- "électricité" (electrical system)
- "murs" (walls)
- "plafond" (ceiling)
- "charpente" (framework)

NOW ANALYZE THE IMAGE:`,

      degat_eau: `Analyze this WATER DAMAGE photo for home insurance.

PART 1 - FRENCH ANALYSIS (2-3 sentences):
Describe water damage, moisture, stains, or flooding.

PART 2 - JSON OUTPUT (MANDATORY):
\`\`\`json
{
  "affectedAreas": ["area1", "area2", "area3"],
  "severity": "minor|moderate|severe",
  "damageType": "leak|flood|burst_pipe|humidity",
  "urgency": "low|medium|high|emergency"
}
\`\`\`

WATER DAMAGE AREAS (French):
- "plafond" (ceiling)
- "mur/murs" (wall/walls)
- "sol/plancher" (floor)
- "cave/sous-sol" (basement)
- "cuisine" (kitchen)
- "salle de bain" (bathroom)
- "toit/toiture" (roof)
- "gouttière" (gutter)
- "tuyauterie" (piping)
- "isolation" (insulation)

NOW ANALYZE THE IMAGE:`,

      property_accident: `Analyze this PROPERTY ACCIDENT damage photo for home insurance.

PART 1 - FRENCH ANALYSIS (2-3 sentences):
Describe the accidental damage to the property.

PART 2 - JSON OUTPUT (MANDATORY):
\`\`\`json
{
  "affectedAreas": ["area1", "area2"],
  "severity": "minor|moderate|severe",
  "damageType": "impact|collision|structural|cosmetic",
  "urgency": "low|medium|high"
}
\`\`\`

PROPERTY ACCIDENT AREAS (French):
- "mur/murs" (wall/walls)
- "porte" (door)
- "fenêtre" (window)
- "plafond" (ceiling)
- "sol/plancher" (floor)
- "escalier" (stairs)
- "balcon" (balcony)
- "clôture" (fence)
- "portail" (gate)
- "garage" (garage)

NOW ANALYZE THE IMAGE:`,

      other_auto: `Analyze this AUTO DAMAGE photo for insurance (other/unspecified type).

PART 1 - FRENCH ANALYSIS (2-3 sentences):
Describe any visible damage to the vehicle.

PART 2 - JSON OUTPUT (MANDATORY):
\`\`\`json
{
  "damagedParts": ["part1", "part2"],
  "severity": "minor|moderate|severe",
  "damageType": "description_of_damage",
  "estimatedCost": "low|medium|high"
}
\`\`\`

AUTO PARTS (French):
- "carrosserie" (body)
- "peinture" (paint)
- "pare-choc" (bumper)
- "porte/portière" (door)
- "capot" (hood)
- "coffre" (trunk)
- "roue/jante" (wheel/rim)
- "pneu" (tire)
- "phare" (headlight)
- "rétroviseur" (mirror)
- "pare-brise" (windshield)
- "toit" (roof)
- "aile" (fender)

NOW ANALYZE THE IMAGE:`,

      cambriolage: `Analyze this BURGLARY/BREAK-IN damage photo for home insurance.

PART 1 - FRENCH ANALYSIS (2-3 sentences):
Describe signs of forced entry or burglary.

PART 2 - JSON OUTPUT (MANDATORY):
\`\`\`json
{
  "affectedAreas": ["area1", "area2"],
  "severity": "minor|moderate|severe",
  "damageType": "forced_entry|vandalism|burglary",
  "entryPoint": "door|window|other"
}
\`\`\`

BURGLARY DAMAGE (French):
- "porte forcée" (forced door)
- "serrure cassée" (broken lock)
- "fenêtre brisée" (broken window)
- "volet endommagé" (damaged shutter)
- "cadre de porte" (door frame)
- "coffre-fort" (safe)
- "meuble forcé" (forced furniture)

NOW ANALYZE THE IMAGE:`,

      property_damage: `Analyze this PROPERTY DAMAGE photo for home insurance.

PART 1 - FRENCH ANALYSIS (2-3 sentences):
Describe the property damage.

PART 2 - JSON OUTPUT (MANDATORY):
\`\`\`json
{
  "affectedAreas": ["area1", "area2"],
  "severity": "minor|moderate|severe",
  "damageType": "structural|cosmetic|equipment",
  "urgency": "low|medium|high"
}
\`\`\`

PROPERTY AREAS (French):
- "structure" (structure)
- "fondations" (foundation)
- "murs" (walls)
- "toit" (roof)
- "électricité" (electrical)
- "plomberie" (plumbing)
- "chauffage" (heating)

NOW ANALYZE THE IMAGE:`,

      general: `Analyze for insurance purposes.

PART 1 - ANALYSIS (brief, 2-3 sentences):
Describe what you observe.

PART 2 - JSON OUTPUT:
\`\`\`json
{
  "damagedParts": ["part1", "part2"],
  "severity": "minor|moderate|severe",
  "damageType": "description"
}
\`\`\`

NOW ANALYZE THE IMAGE:`,
    };

    return prompts[context] || prompts.general;
  }
}
