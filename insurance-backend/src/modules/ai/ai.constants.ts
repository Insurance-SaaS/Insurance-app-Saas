/**
 * Static data of the assistant: languages, the fields each conversation
 * collects (in order), product names and field labels.
 */

// ============= TYPES =============
export interface ImageData {
  filename: string;
  mimetype: string;
  buffer: Buffer;
  base64: string;
}

// ============= LANGUAGE DETECTION =============
export enum Language {
  FRENCH = 'fr',
  ENGLISH = 'en',
  ARABIC = 'ar',
}

/** The text for a language; `fallback` serves every language that is not listed. */
export function byLanguage<T>(
  language: string | undefined,
  texts: Partial<Record<Language, T>>,
  fallback: T,
): T {
  return texts[language as Language] ?? fallback;
}

// ============= ORDERED FIELDS FOR SINISTRE =============
export const SINISTRE_FIELDS_ORDER = [
  'typeSinistre',
  'dateSinistre',
  'heureSinistre',
  'lieuSinistre',
  'descriptionIncident',
  'partiesEndommagees',
  'photos',
];

// ============= ORDERED FIELDS FOR DEVIS =============
export const DEVIS_FIELDS_ORDER = [
  'productType',
  'age',
  'codePostal',
  'budget',
  'vehicleType', // Optional for auto devis
];

// ============= INSURANCE TYPES =============
export const INSURANCE_TYPES = {
  fr: [
    'Assurance automobile',
    'Assurance automobile avec option de paiement fractionné',
    'Assurance habitation',
    'Assurance scolaire',
    'Assurance bateau de plaisance',
    'Assurance catastrophes naturelles (CAT-NAT)',
    'Assurance multirisques professionnelle (MRP)',
  ],
  en: [
    'Car insurance',
    'Car insurance with installment payment option',
    'Home insurance',
    'School insurance',
    'Pleasure boat insurance',
    'Natural disaster insurance (CAT-NAT)',
    'Professional multi-risk insurance (MRP)',
  ],
  ar: [
    'تأمين السيارات',
    'تأمين السيارات مع خيار الدفع بالتقسيط',
    'تأمين المنزل',
    'تأمين مدرسي',
    'تأمين قارب الترفيه',
    'تأمين الكوارث الطبيعية (CAT-NAT)',
    'تأمين متعدد المخاطر المهنية (MRP)',
  ],
};

export const FIELD_TRANSLATIONS = {
  typeSinistre: {
    fr: 'type de sinistre',
    en: 'type of claim',
    ar: 'نوع المطالبة',
  },
  dateSinistre: {
    fr: 'date du sinistre',
    en: 'date of incident',
    ar: 'تاريخ الحادث',
  },
  heureSinistre: {
    fr: 'heure du sinistre',
    en: 'time of incident',
    ar: 'وقت الحادث',
  },
  lieuSinistre: {
    fr: 'lieu du sinistre',
    en: 'location of incident',
    ar: 'مكان الحادث',
  },
  descriptionIncident: {
    fr: "description détaillée de l'incident",
    en: 'detailed description of the incident',
    ar: 'وصف تفصيلي للحادث',
  },
  partiesEndommagees: {
    fr: 'parties endommagées (véhicule, bâtiment, etc.)',
    en: 'damaged parts (vehicle, building, etc.)',
    ar: 'الأجزاء المتضررة (السيارة، المبنى، إلخ)',
  },
  photos: {
    fr: 'photos des dégâts',
    en: 'photos of damages',
    ar: 'صور الأضرار',
  },
  // Devis fields
  productType: {
    fr: "type de produit d'assurance",
    en: 'insurance product type',
    ar: 'نوع منتج التأمين',
  },
  age: {
    fr: 'âge',
    en: 'age',
    ar: 'العمر',
  },
  codePostal: {
    fr: 'code postal',
    en: 'postal code',
    ar: 'الرمز البريدي',
  },
  budget: {
    fr: 'budget mensuel',
    en: 'monthly budget',
    ar: 'الميزانية الشهرية',
  },
  vehicleType: {
    fr: 'type de véhicule',
    en: 'vehicle type',
    ar: 'نوع المركبة',
  },
};

export enum ConversationType {
  SINISTRE_AUTO = 'sinistre_auto',
  SINISTRE_HABITATION = 'sinistre_habitation',
  DEVIS_AUTO = 'devis_auto',
  DEVIS_HABITATION = 'devis_habitation',
  DEVIS_SANTE = 'devis_sante',
  DEVIS_SCOLAIRE = 'devis_scolaire',
  DEVIS_BATEAU = 'devis_bateau',
  DEVIS_CATNAT = 'devis_catnat',
  DEVIS_MRP = 'devis_mrp',
  QUESTION = 'question',
  NON_INSURANCE = 'non_insurance',
  IDLE = 'idle',
}
