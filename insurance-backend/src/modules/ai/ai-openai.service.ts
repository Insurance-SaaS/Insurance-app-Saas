import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { StateGraph, END, START } from '@langchain/langgraph';
import {
  ChatMessage,
  ChatOptions,
  LlmError,
  OpenAIClientService,
  parseJsonObject,
} from './openai-client.service';
import { AiSessionStore, StoredImage } from './ai-session.store';
import {
  ConversationType,
  DEVIS_FIELDS_ORDER,
  FIELD_TRANSLATIONS,
  ImageData,
  INSURANCE_TYPES,
  Language,
  SINISTRE_FIELDS_ORDER,
  byLanguage,
} from './ai.constants';
import { GraphState, replaceWith } from './ai-graph.state';
import { AiImageAnalysisService } from './ai-image-analysis.service';
import { RedisCheckpointSaver } from './redis-checkpoint-saver';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { IClaimsService } from 'src/contracts/interfaces/i-claims.service';
import { IQuotesService } from 'src/contracts/interfaces/i-quotes.service';
import { CLAIMS_SERVICE, QUOTES_SERVICE } from 'src/contracts/tokens';
import { GetQuotes } from 'src/modules/quotes/quotes.service';
import { DateValidationService } from 'src/shared/services/date-validation.service';
import { LocationValidationService } from 'src/shared/services/location-validation.service';
import { UploadedFile } from 'src/shared/types/uploaded-file';

/** What a conversation turn needs to know about itself, available to every node. */
interface TurnContext {
  threadId: string;
}

/** The text of a conversation message; structured content (text plus images) is shown as JSON. */
function textOf(message: { content: unknown }): string {
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
}

@Injectable()
export class AiOpenAIService {
  private readonly logger = new Logger(AiOpenAIService.name);
  private readonly graph: any;
  private readonly checkpointer: RedisCheckpointSaver;
  private readonly turn = new AsyncLocalStorage<TurnContext>();

  private readonly MAX_CONVERSATION_MESSAGES = 20;

  constructor(
    @Inject(CLAIMS_SERVICE)
    private readonly claimsService: IClaimsService,
    @Inject(QUOTES_SERVICE)
    private readonly devisService: IQuotesService,
    private readonly dateValidationService: DateValidationService,
    private readonly locationValidationService: LocationValidationService,
    private readonly aiClient: OpenAIClientService,
    private readonly imageAnalysis: AiImageAnalysisService,
    private readonly sessionStore: AiSessionStore,
    private readonly tenantContext: TenantContextService,
    redis: RedisService,
  ) {
    // Conversation state lives in Redis and expires on its own: nothing is kept
    // in this process, so any instance can serve the next message.
    this.checkpointer = new RedisCheckpointSaver(redis);
    this.graph = this.buildGraph();

    this.logger.log('AI Service initialized successfully');
  }

  // ============= LLM CALLS =============

  /** Every model call of a turn goes through here so its tokens are accounted to the conversation. */
  private async recordUsage<T extends { usage?: any }>(response: T): Promise<T> {
    const threadId = this.turn.getStore()?.threadId;
    if (threadId && response.usage) {
      await this.sessionStore.addUsage(threadId, response.usage).catch(() => undefined);
    }
    return response;
  }

  private async chat(messages: ChatMessage[], options?: ChatOptions & { json?: boolean }) {
    return this.recordUsage(await this.aiClient.chatCompletionWithRetry(messages, options));
  }

  /**
   * A node may fall back when the model's answer cannot be used, but not when
   * the provider itself failed (rate limit, timeout, outage): then the whole
   * turn fails, so the client gets the matching HTTP status and can retry,
   * instead of a conversation that silently went on with made-up values.
   */
  private failTurnOnProviderError(error: unknown): void {
    if (error instanceof LlmError) {
      throw error;
    }
  }

  // ============= LANGUAGE DETECTION =============

  private detectLanguage(text: string): Language {
    const arabicPattern = /[\u0600-\u06FF]/;
    if (arabicPattern.test(text)) {
      return Language.ARABIC;
    }

    const normalizedText = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const tokens = normalizedText.split(/[^a-z0-9]+/).filter(Boolean);

    if (tokens.length === 0) {
      return Language.FRENCH;
    }

    const englishKeywords = new Set([
      'claim',
      'accident',
      'insurance',
      'quote',
      'policy',
      'damage',
      'car',
      'auto',
      'vehicle',
      'home',
      'house',
      'need',
      'please',
      'hello',
      'hi',
      'help',
      'coverage',
      'report',
      'support',
    ]);

    const frenchKeywords = new Set([
      'bonjour',
      'salut',
      'merci',
      'devis',
      'assurance',
      'sinistre',
      'accident',
      'besoin',
      'aide',
      'voiture',
      'auto',
      'vehicule',
      'maison',
      'habitation',
      'sos',
      'svp',
      'silt',
      'vous',
      'plait',
      'je',
      'veux',
      'obtenir',
      'aimerais',
      'question',
    ]);

    let englishScore = 0;
    let frenchScore = 0;

    for (const token of tokens) {
      if (englishKeywords.has(token)) {
        englishScore += 1;
      }
      if (frenchKeywords.has(token)) {
        frenchScore += 1;
      }
    }

    if (englishScore > frenchScore) {
      return Language.ENGLISH;
    }

    return Language.FRENCH;
  }

  private getSystemPromptForType(conversationType: string, language: Language): string {
    const prompts: Record<string, Record<Language, string>> = {
      sinistre_auto: {
        fr: "Vous êtes un assistant expert en déclaration de sinistres automobiles. Vous êtes empathique, professionnel et guidez l'utilisateur à travers le processus de déclaration.",
        en: 'You are an expert assistant for car insurance claims. You are empathetic, professional and guide the user through the declaration process.',
        ar: 'أنت مساعد خبير في تقديم مطالبات التأمين على السيارات. أنت متعاطف ومحترف وتوجه المستخدم خلال عملية التصريح.',
      },
      sinistre_habitation: {
        fr: "Vous êtes un assistant expert en déclaration de sinistres habitation. Vous êtes empathique, professionnel et guidez l'utilisateur à travers le processus de déclaration.",
        en: 'You are an expert assistant for home insurance claims. You are empathetic, professional and guide the user through the declaration process.',
        ar: 'أنت مساعد خبير في تقديم مطالبات التأمين على المنزل. أنت متعاطف ومحترف وتوجه المستخدم خلال عملية التصريح.',
      },
      question: {
        fr: "Vous êtes un assistant d'assurance serviable. Répondez aux questions de manière claire et professionnelle.",
        en: 'You are a helpful insurance assistant. Answer questions clearly and professionally.',
        ar: 'أنت مساعد تأمين مفيد. أجب على الأسئلة بوضوح واحترافية.',
      },
      devis_auto: {
        fr: "Vous êtes un assistant expert en devis d'assurance automobile. Vous guidez l'utilisateur pour obtenir les meilleures offres.",
        en: 'You are an expert assistant for car insurance quotes. You guide the user to get the best offers.',
        ar: 'أنت مساعد خبير في عروض أسعار التأمين على السيارات. توجه المستخدم للحصول على أفضل العروض.',
      },
      devis_habitation: {
        fr: "Vous êtes un assistant expert en devis d'assurance habitation. Vous guidez l'utilisateur pour obtenir les meilleures offres.",
        en: 'You are an expert assistant for home insurance quotes. You guide the user to get the best offers.',
        ar: 'أنت مساعد خبير في عروض أسعار التأمين على المنزل. توجه المستخدم للحصول على أفضل العروض.',
      },
      devis_sante: {
        fr: "Vous êtes un assistant expert en devis d'assurance santé. Vous guidez l'utilisateur pour obtenir les meilleures offres.",
        en: 'You are an expert assistant for health insurance quotes. You guide the user to get the best offers.',
        ar: 'أنت مساعد خبير في عروض أسعار التأمين الصحي. توجه المستخدم للحصول على أفضل العروض.',
      },
      devis_scolaire: {
        fr: "Vous êtes un assistant expert en devis d'assurance scolaire. Vous guidez l'utilisateur pour obtenir les meilleures offres.",
        en: 'You are an expert assistant for school insurance quotes. You guide the user to get the best offers.',
        ar: 'أنت مساعد خبير في عروض أسعار التأمين المدرسي. توجه المستخدم للحصول على أفضل العروض.',
      },
      devis_bateau: {
        fr: "Vous êtes un assistant expert en devis d'assurance bateau de plaisance. Vous guidez l'utilisateur pour obtenir les meilleures offres.",
        en: 'You are an expert assistant for pleasure boat insurance quotes. You guide the user to get the best offers.',
        ar: 'أنت مساعد خبير في عروض أسعار التأمين على قوارب الترفيه. توجه المستخدم للحصول على أفضل العروض.',
      },
      devis_catnat: {
        fr: "Vous êtes un assistant expert en devis d'assurance catastrophes naturelles (CAT-NAT). Vous guidez l'utilisateur pour obtenir les meilleures offres.",
        en: 'You are an expert assistant for natural disaster insurance (CAT-NAT) quotes. You guide the user to get the best offers.',
        ar: 'أنت مساعد خبير في عروض أسعار التأمين ضد الكوارث الطبيعية (CAT-NAT). توجه المستخدم للحصول على أفضل العروض.',
      },
      devis_mrp: {
        fr: "Vous êtes un assistant expert en devis d'assurance multirisques professionnelle (MRP). Vous guidez l'utilisateur pour obtenir les meilleures offres.",
        en: 'You are an expert assistant for professional multi-risk insurance (MRP) quotes. You guide the user to get the best offers.',
        ar: 'أنت مساعد خبير في عروض أسعار التأمين متعدد المخاطر المهنية (MRP). توجه المستخدم للحصول على أفضل العروض.',
      },
      non_insurance: {
        fr: "Vous êtes un assistant d'assurance spécialisé. Vous ne pouvez répondre qu'aux questions liées à l'assurance.",
        en: 'You are a specialized insurance assistant. You can only answer insurance-related questions.',
        ar: 'أنت مساعد تأمين متخصص. يمكنك الإجابة فقط على الأسئلة المتعلقة بالتأمين.',
      },
    };

    // A conversation type without a prompt of its own uses the one of its family.
    let family = prompts.question;
    if (conversationType.startsWith('devis_')) {
      family = prompts.devis_auto;
    } else if (conversationType.startsWith('sinistre_')) {
      family = prompts.sinistre_auto;
    }
    const basePrompt = prompts[conversationType]?.[language] ?? family[language];

    // A tenant may put its own instructions in front (config.aiSystemPrompt:
    // one string, or one per language).
    const configured = this.tenantContext.getTenant()?.config?.aiSystemPrompt;
    const forLanguage = typeof configured === 'string' ? configured : configured?.[language];
    const tenantPrompt = typeof forLanguage === 'string' ? forLanguage : '';

    return tenantPrompt ? `${tenantPrompt}\n\n${basePrompt}` : basePrompt;
  }

  private getTranslatedPrompt(lang: Language, key: string): string {
    const prompts = {
      thankYou: {
        fr: 'Merci pour ces informations.',
        en: 'Thank you for this information.',
        ar: 'شكرا على هذه المعلومات.',
      },
      nextQuestion: {
        fr: 'Pourriez-vous maintenant me fournir',
        en: 'Could you now provide me with',
        ar: 'هل يمكنك الآن تزويدي بـ',
      },
    };

    return prompts[key]?.[lang] || prompts[key]?.fr || '';
  }

  // ============= CONTEXT BUILDING =============

  private buildContextMessage(state: typeof GraphState.State): string {
    const hasImages = state.imageAnalysis && state.imageAnalysis.length > 0;
    const progress = this.calculateProgress(state);

    let context = `CONVERSATION CONTEXT:
- Type: ${state.conversationType}
- Language: ${state.language}
- Goal: ${state.conversationGoal}
- Progress: ${progress}% (${state.currentFieldIndex}/${SINISTRE_FIELDS_ORDER.length} fields)

COLLECTED DATA:
${JSON.stringify(state.extractedData, null, 2)}

STILL NEEDED:
${state.missingInfo.length > 0 ? state.missingInfo.join(', ') : 'None - Ready to complete'}

VALIDATION STATUS:
- Policy Valid: ${state.policyValid}
- Fraud Score: ${state.fraudScore}/100
- Needs Review: ${state.needsHumanReview}`;

    if (hasImages) {
      context += `\n- Images Received: ${state.imageAnalysis.length} photo(s)`;

      context += `\n\nIMAGE ANALYSIS SUMMARY:`;
      state.imageAnalysis.slice(-3).forEach((img, i) => {
        context += `\nPhoto ${i + 1} (${img.filename}): ${img.analysis.substring(0, 150)}...`;
      });
    }

    if (state.conversationSummary) {
      context += `\n\nPREVIOUS CONTEXT SUMMARY:\n${state.conversationSummary}`;
    }

    return context;
  }

  private getInstructionsForCurrentState(state: typeof GraphState.State): string {
    if (state.conversationType === 'non_insurance') {
      return 'Politely redirect to insurance-related topics.';
    }

    // Handle devis conversation flow
    if (state.conversationType.startsWith('devis_')) {
      return this.getDevisInstructions(state);
    }

    if (state.awaitingConfirmation) {
      return 'User is reviewing the information. Ask if they want to confirm or modify something.';
    }

    if (state.missingInfo.length === 0 && !state.awaitingConfirmation) {
      return 'All information collected. Show a summary of collected data and ask the user to confirm before saving, or if they want to modify something.';
    }

    // ✅ PRIORITIZE PHOTOS if user declined to provide them
    let nextField = state.missingInfo[0];
    if (state.userDeclinedPhotos && state.missingInfo.includes('photos')) {
      // If user declined photos, prioritize asking for photos with requirement message
      nextField = 'photos';
    }

    const translation = FIELD_TRANSLATIONS[nextField]?.[state.language] || nextField;

    const briefInstructions = {
      typeSinistre: {
        fr: "Demande brièvement le type de sinistre (accident, feu, vol, endommage d'eau, autre_type). Sois concis.",
        en: 'Briefly ask for the type of claim (accident, fire, theft, water damage, other). Be concise.',
        ar: 'اسأل بإيجاز عن نوع المطالبة (حادث، حريق، سرقة، ضرر المياه، أخرى). كن موجزاً.',
      },
      dateSinistre: {
        fr: 'Demande brièvement la date du sinistre. Exemple: "Ok, donne-moi la date" (n\'importe quel format).',
        en: 'Briefly ask for the date of the incident. Example: "Ok, give me the date" (any format).',
        ar: 'اسأل بإيجاز عن تاريخ الحادث. مثال: "حسناً، أعطني التاريخ" (أي تنسيق).',
      },
      heureSinistre: {
        fr: 'Demande brièvement l\'heure. Exemple: "Et l\'heure?"',
        en: 'Briefly ask for the time. Example: "And the time?"',
        ar: 'اسأل بإيجاز عن الوقت. مثال: "والوقت؟"',
      },
      lieuSinistre: {
        fr: 'Demande brièvement le lieu/l\'adresse. Exemple: "Ok, où ça s\'est passé?"',
        en: 'Briefly ask for the location/address. Example: "Ok, where did it happen?"',
        ar: 'اسأل بإيجاز عن المكان/العنوان. مثال: "حسناً، أين حدث؟"',
      },
      descriptionIncident: {
        fr: 'Demande brièvement une description. Exemple: "Décris-moi ce qui s\'est passé"',
        en: 'Briefly ask for a description. Example: "Describe what happened"',
        ar: 'اسأل بإيجاز عن الوصف. مثال: "صف لي ما حدث"',
      },
      partiesEndommagees: {
        fr: 'Demande brièvement les parties endommagées. Exemple: "Quelles parties sont endommagées?"',
        en: 'Briefly ask for damaged parts. Example: "Which parts are damaged?"',
        ar: 'اسأل بإيجاز عن الأجزاء المتضررة. مثال: "ما هي الأجزاء المتضررة؟"',
      },
      photos: {
        fr: (userDeclined: boolean) =>
          userDeclined
            ? 'Les photos sont obligatoires pour traiter votre sinistre. Veuillez fournir au moins une photo des dégâts.'
            : 'Demande brièvement s\'ils ont des photos. Exemple: "As-tu des photos des dégâts?"',
        en: (userDeclined: boolean) =>
          userDeclined
            ? 'Images are required to process your claim. Please provide at least one photo of the damages.'
            : 'Briefly ask if they have photos. Example: "Do you have photos of the damages?"',
        ar: (userDeclined: boolean) =>
          userDeclined
            ? 'الصور مطلوبة لمعالجة مطالبتك. يرجى تقديم صورة واحدة على الأقل للأضرار.'
            : 'اسأل بإيجاز عما إذا كان لديهم صور. مثال: "هل لديك صور للأضرار؟"',
      },
    };

    const instruction = briefInstructions[nextField]?.[state.language];

    // Handle photos instruction which is now a function
    if (nextField === 'photos' && typeof instruction === 'function') {
      const userDeclinedPhotos = state.userDeclinedPhotos || false;
      return instruction(userDeclinedPhotos);
    }

    return (
      (typeof instruction === 'function' ? instruction(false) : instruction) ||
      `Ask for: "${translation}". Be brief and natural.`
    );
  }

  private getDevisInstructions(state: typeof GraphState.State): string {
    const { devisStep, missingInfo, recommendedDevis, selectedDevisId } = state;

    if (devisStep === 'showing_options' && recommendedDevis.length > 0) {
      return 'Show the recommended quotes and ask the user to choose one by number or name.';
    }

    if (devisStep === 'showing_details' && selectedDevisId) {
      return 'Show detailed information about the selected quote and ask if they want to proceed or see other options.';
    }

    if (missingInfo.length === 0) {
      return 'All information collected. Generate quotes based on the collected data.';
    }

    const nextField = missingInfo[0];
    const translation = FIELD_TRANSLATIONS[nextField]?.[state.language] || nextField;

    const insuranceListFr = this.getInsuranceTypesList(Language.FRENCH);
    const insuranceListEn = this.getInsuranceTypesList(Language.ENGLISH);
    const insuranceListAr = this.getInsuranceTypesList(Language.ARABIC);

    const devisInstructions = {
      productType: {
        fr: `Demande le type de produit d'assurance. Présente les 7 types disponibles et demande à l'utilisateur de choisir. Exemple: "Quel type d'assurance souhaitez-vous? Voici nos types disponibles:\n${insuranceListFr}"`,
        en: `Ask for the insurance product type. Present the 7 available types and ask the user to choose. Example: "What type of insurance do you need? Here are our available types:\n${insuranceListEn}"`,
        ar: `اسأل عن نوع منتج التأمين. اعرض الأنواع السبعة المتاحة واطلب من المستخدم الاختيار. مثال: "ما نوع التأمين الذي تحتاجه؟ إليك الأنواع المتاحة:\n${insuranceListAr}"`,
      },
      age: {
        fr: 'Demande l\'âge. Exemple: "Quel est votre âge?"',
        en: 'Ask for age. Example: "What is your age?"',
        ar: 'اسأل عن العمر. مثال: "ما هو عمرك؟"',
      },
      codePostal: {
        fr: 'Demande le code postal. Exemple: "Quel est votre code postal?"',
        en: 'Ask for postal code. Example: "What is your postal code?"',
        ar: 'اسأل عن الرمز البريدي. مثال: "ما هو الرمز البريدي الخاص بك؟"',
      },
      budget: {
        fr: 'Demande le budget mensuel. Exemple: "Quel est votre budget mensuel?"',
        en: 'Ask for monthly budget. Example: "What is your monthly budget?"',
        ar: 'اسأل عن الميزانية الشهرية. مثال: "ما هي ميزانيتك الشهرية؟"',
      },
      vehicleType: {
        fr: 'Demande le type de véhicule (voiture, moto, camion). Exemple: "Quel type de véhicule?"',
        en: 'Ask for vehicle type (car, motorcycle, truck). Example: "What type of vehicle?"',
        ar: 'اسأل عن نوع المركبة (سيارة، دراجة نارية، شاحنة). مثال: "ما نوع المركبة؟"',
      },
    };

    return (
      devisInstructions[nextField]?.[state.language] ||
      `Ask for: "${translation}". Be brief and natural.`
    );
  }

  private getInsuranceTypesList(language: Language): string {
    const types = INSURANCE_TYPES[language] || INSURANCE_TYPES[Language.FRENCH];
    return types.map((type, index) => `${index + 1}. ${type}`).join('\n');
  }

  private getInsuranceLabelForProductType(productType: string, language: Language): string {
    if (!productType) {
      return '';
    }

    const { canonical } = this.resolveProductType(productType);
    const langKey = (
      ['fr', 'en', 'ar'].includes(language as string) ? language : Language.FRENCH
    ) as keyof typeof INSURANCE_TYPES;

    const indexMap: Record<string, number> = {
      auto: 0,
      auto_fractional: 1,
      habitation: 2,
      scolaire: 3,
      bateau: 4,
      catnat: 5,
      mrp: 6,
    };

    if (canonical && indexMap[canonical] !== undefined) {
      const entries = INSURANCE_TYPES[langKey];
      return entries?.[indexMap[canonical]] || productType;
    }

    if (canonical === 'sante') {
      const labels = {
        fr: 'Assurance santé',
        en: 'Health insurance',
        ar: 'تأمين صحي',
      };
      return labels[langKey] || productType;
    }

    return productType;
  }

  private formatDevisConfirmationPrompt(state: typeof GraphState.State): string {
    const language = (
      ['fr', 'en', 'ar'].includes(state.language as string)
        ? (state.language as Language)
        : Language.FRENCH
    ) as Language;
    const data = state.extractedData || {};
    const lines: string[] = [];

    const fieldOrder = ['productType', 'age', 'codePostal', 'budget', 'vehicleType'];
    fieldOrder.forEach((field) => {
      const value = data[field];
      if (value === undefined || value === null || value === '') {
        return;
      }

      let displayValue = value;
      if (field === 'productType') {
        displayValue =
          data.productTypeLabel || this.getInsuranceLabelForProductType(value, language);
      }

      const label = FIELD_TRANSLATIONS[field]?.[language] || field;
      lines.push(`- ${label} : ${displayValue}`);
    });

    let header = '';
    let footer = '';

    switch (language) {
      case Language.ENGLISH:
        header = 'Thanks! Here is the summary:';
        footer = 'Do you confirm these details? Reply "yes" to continue or tell me what to change.';
        break;
      case Language.ARABIC:
        header = 'شكرًا! إليك الملخص:';
        footer = 'هل تؤكد هذه المعلومات؟ رد بـ "نعم" للمتابعة أو اذكر ما تريد تعديله.';
        break;
      case Language.FRENCH:
      default:
        header = 'Merci ! Voici un récapitulatif :';
        footer =
          'Confirmez-vous ces informations ? Répondez "oui" pour continuer ou indiquez ce qui doit être modifié.';
        break;
    }

    return `${header}
${lines.join('\n')}

${footer}`;
  }

  private interpretDevisConfirmation(
    message: string,
    language: Language,
  ): 'confirm' | 'modify' | 'cancel' | 'unknown' {
    const normalized = this.normalizeForComparison(message);
    if (!normalized) {
      return 'unknown';
    }

    const confirmWords = [
      'oui',
      'ouais',
      'ok',
      'okay',
      'daccord',
      'confirme',
      'je confirme',
      'cest bon',
      'parfait',
      'valide',
      'yes',
      'yep',
      'sure',
      'confirm',
      'نعم',
      'موافق',
      'تمام',
    ];

    const modifyWords = [
      'modifier',
      'modifie',
      'change',
      'changer',
      'corriger',
      'ajuster',
      'update',
      'edit',
      'تعديل',
      'غير',
    ];

    const cancelWords = ['annuler', 'cancel', 'stop', 'abandon', 'non', 'no', 'لا', 'الغاء'];

    if (modifyWords.some((word) => normalized.includes(word))) {
      return 'modify';
    }

    if (cancelWords.some((word) => normalized.includes(word))) {
      return 'cancel';
    }

    if (confirmWords.some((word) => normalized.includes(word))) {
      return 'confirm';
    }

    return 'unknown';
  }

  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private resolveProductType(productType: string | undefined | null): {
    canonical: string;
    slug: string;
    isAlias: boolean;
  } {
    if (!productType) {
      return { canonical: '', slug: '', isAlias: false };
    }

    const sanitized = productType
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!sanitized) {
      return { canonical: '', slug: '', isAlias: false };
    }

    const synonymMap: Record<string, string[]> = {
      auto: [
        'auto',
        'automobile',
        'car',
        'vehicle',
        'vehicule',
        'voiture',
        'motorcycle',
        'motorbike',
        'bike',
        'moto',
        'pickup',
        'truck',
        'camion',
        'van',
        'suv',
        'bus',
        'minibus',
        'two wheeler',
        '2 roues',
        '4x4',
      ],
      auto_fractional: [
        'auto fractional',
        'auto fractionne',
        'auto fractionnel',
        'paiement fractionne',
        'payment fractionne',
        'installment',
        'mensualite',
        'paiement mensuel',
      ],
      habitation: [
        'habitation',
        'home',
        'house',
        'logement',
        'maison',
        'residence',
        'appartement',
        'apartment',
        'flat',
        'property',
        'immobilier',
      ],
      sante: ['sante', 'health', 'medical', 'mutuelle', 'assurance maladie', 'medicale'],
      scolaire: [
        'scolaire',
        'school',
        'scholar',
        'etudiant',
        'student',
        'ecole',
        'college',
        'lycee',
        'universite',
      ],
      bateau: ['bateau', 'boat', 'marine', 'navire', 'plaisance', 'yacht', 'voilier', 'ferry'],
      catnat: ['catnat', 'catastrophe naturelle', 'natural disaster', 'catastrophe', 'cataclysme'],
      mrp: [
        'mrp',
        'professionnelle',
        'professional',
        'business',
        'entreprise',
        'enterprise',
        'company',
        'multirisque',
        'multirisk',
        'commercial',
      ],
    };

    for (const [canonical, keywords] of Object.entries(synonymMap)) {
      if (keywords.some((keyword) => sanitized.includes(keyword))) {
        return { canonical, slug: canonical, isAlias: true };
      }
    }

    const slug = sanitized.replace(/\s+/g, '_');
    return { canonical: slug, slug, isAlias: false };
  }

  private isVehicleProductType(productType: string | undefined | null): boolean {
    const { canonical } = this.resolveProductType(productType);
    return canonical === 'auto' || canonical === 'auto_fractional';
  }

  private mapProductTypeToConversationType(
    productType: string,
    fallback?: ConversationType,
  ): ConversationType {
    const { canonical, slug } = this.resolveProductType(productType);
    const normalized = canonical || slug;

    if (!normalized) {
      return fallback || ConversationType.DEVIS_AUTO;
    }

    const aliasMap: Record<string, ConversationType> = {
      auto: ConversationType.DEVIS_AUTO,
      auto_fractional: ConversationType.DEVIS_AUTO,
      habitation: ConversationType.DEVIS_HABITATION,
      scolaire: ConversationType.DEVIS_SCOLAIRE,
      bateau: ConversationType.DEVIS_BATEAU,
      catnat: ConversationType.DEVIS_CATNAT,
      mrp: ConversationType.DEVIS_MRP,
      sante: ConversationType.DEVIS_SANTE,
    };

    if (aliasMap[canonical]) {
      return aliasMap[canonical];
    }

    const enumKey = `DEVIS_${normalized.toUpperCase()}`;
    if ((ConversationType as any)[enumKey]) {
      return (ConversationType as any)[enumKey];
    }

    if (normalized) {
      return `devis_${normalized}` as ConversationType;
    }

    return fallback || ConversationType.DEVIS_AUTO;
  }

  // ============= GRAPH NODES =============

  private async pruneMessages(state: typeof GraphState.State) {
    const messageCount = state.messages.length;

    if (messageCount <= this.MAX_CONVERSATION_MESSAGES) {
      return {};
    }

    this.logger.log(`Pruning messages: ${messageCount} -> ${this.MAX_CONVERSATION_MESSAGES}`);

    const summary = await this.summarizeOldContext(state.messages, state.language);

    const systemMessages = state.messages.filter((m) => m._getType() === 'system');
    const recentMessages = state.messages.filter((m) => m._getType() !== 'system').slice(-10);

    const summaryMessage = new SystemMessage(`Previous conversation summary:\n${summary}`);

    return {
      messages: replaceWith([...systemMessages, summaryMessage, ...recentMessages]),
      conversationSummary: summary,
    };
  }

  private async summarizeOldContext(
    messages: Array<HumanMessage | AIMessage | SystemMessage>,
    language: Language,
  ): Promise<string> {
    if (messages.length < 15) {
      return '';
    }

    const toSummarize = messages.slice(0, -10);
    const conversationText = toSummarize
      .filter((m) => m._getType() !== 'system')
      .map((m) => `${m._getType() === 'human' ? 'User' : 'Assistant'}: ${textOf(m)}`)
      .join('\n');

    const summaryPrompt = `Summarize this conversation history in ${language}.
Focus on: extracted data, user concerns, and important context.
Be concise (max 200 words).

Conversation:
${conversationText}`;

    try {
      const messages = this.aiClient.convertLangChainMessages([new HumanMessage(summaryPrompt)]);
      const response = await this.chat(messages, {
        maxTokens: 300,
        temperature: 0.5,
      });
      return response.content;
    } catch (error) {
      this.failTurnOnProviderError(error);
      this.logger.error('Failed to generate summary:', error);
      return 'Previous conversation context available.';
    }
  }

  /** True when a home claim talks about a car accident, or a car claim only about a home. */
  private contradictsConversationType(
    state: typeof GraphState.State,
    hasAutoKeywords: boolean,
    hasHabitationKeywords: boolean,
  ): boolean {
    const extractedType = state.extractedData?.typeSinistre?.toLowerCase();
    if (state.conversationType === 'sinistre_habitation') {
      return (
        hasAutoKeywords || Boolean(extractedType && /(accident|collision)/i.test(extractedType))
      );
    }
    return state.conversationType === 'sinistre_auto' && hasHabitationKeywords && !hasAutoKeywords;
  }

  private async classifyIntent(state: typeof GraphState.State) {
    const lastMessage = state.messages.at(-1)!;
    const rawContent = (lastMessage.content as string) || '';
    const trimmedContent = rawContent.trim();
    let detectedLang = this.detectLanguage(rawContent);
    const hasAlphabeticCharacters = /[A-Za-z\u00C0-\u024F\u0600-\u06FF]/.test(trimmedContent);
    if (!hasAlphabeticCharacters && state.language) {
      detectedLang = state.language as Language;
    }
    const hasImages = state.imageAnalysis && state.imageAnalysis.length > 0;

    // ✅ Check for clear type indicators in the message that might contradict current type
    const hasAutoKeywords =
      /(accident|voiture|véhicule|automobile|auto|car|vehicle|collision|crash)/i.test(rawContent);
    const hasHabitationKeywords =
      /(maison|domicile|habitation|appartement|appart|vol|effraction|cambriolage|incendie|feu|water|eau|dégât)/i.test(
        rawContent,
      );

    // ✅ CRITICAL: If we're already in an active sinistre/devis conversation with progress,
    // preserve the conversation type - BUT allow reclassification if message clearly indicates different type
    const isActiveFlow =
      state.conversationType?.startsWith('sinistre_') ||
      state.conversationType?.startsWith('devis_');
    const hasProgress = state.extractedData && Object.keys(state.extractedData).length > 0;
    const missingInfo = state.missingInfo && state.missingInfo.length > 0;

    // Allow reclassification when the message clearly contradicts the current type.
    const typeMismatch = this.contradictsConversationType(
      state,
      hasAutoKeywords,
      hasHabitationKeywords,
    );

    if (isActiveFlow && (hasProgress || missingInfo) && !typeMismatch) {
      this.logger.log(
        `Preserving conversation type "${state.conversationType}" - active flow with progress`,
      );
      return {
        conversationType: state.conversationType,
        conversationGoal: state.conversationGoal || 'Continuing active conversation',
        language: detectedLang,
      };
    }

    if (typeMismatch) {
      this.logger.warn(
        `Type mismatch detected: current="${state.conversationType}", message indicates different type. Allowing reclassification.`,
      );
    }

    const classificationPrompt = `Analyze this message and determine the conversation type.

Message: "${rawContent}"
${hasImages ? `Images provided: ${state.imageAnalysis.length}` : ''}
${isActiveFlow ? `⚠️ CURRENT CONTEXT: ${state.conversationType} - Active conversation in progress with ${Object.keys(state.extractedData || {}).length} fields collected. If this message appears to be an answer to a question (location, date, description, etc.), you MUST preserve "${state.conversationType}". Only classify as "non_insurance" if clearly unrelated.` : `Current context: ${state.conversationType || 'new conversation'}`}

Possible types:
- sinistre_auto: Car accident/claim
- sinistre_habitation: Home claim (water, theft, fire)
- devis_auto: Car insurance quote
- devis_habitation: Home insurance quote
- devis_sante: Health insurance quote
- question: General insurance question
- non_insurance: NOT insurance related (weather, politics, etc.)

${isActiveFlow ? 'CRITICAL: If this appears to be a response to a question being asked (like a location, date, time, description), KEEP the current conversation type. Do NOT classify location inputs or answers as "non_insurance".' : ''}

Respond with JSON:
{
  "conversationType": "type",
  "conversationGoal": "goal description",
  "confidence": "high|medium|low"
}`;

    try {
      const messages = this.aiClient.convertLangChainMessages([
        new HumanMessage(classificationPrompt),
      ]);
      const response = await this.chat(messages, {
        temperature: 0.7,
        maxTokens: 512,
        json: true,
      });

      const classification = parseJsonObject(response.content);

      return {
        conversationType: classification.conversationType,
        conversationGoal: classification.conversationGoal,
        language: detectedLang,
      };
    } catch (error) {
      this.failTurnOnProviderError(error);
      this.logger.error('Classification error:', error);
      return {
        conversationType: 'question',
        conversationGoal: 'Question générale',
        language: detectedLang,
      };
    }
  }

  private async extractInformation(state: typeof GraphState.State) {
    const lastMessage = state.messages.at(-1)!;
    const hasImages = state.imageAnalysis && state.imageAnalysis.length > 0;

    if (state.conversationType.startsWith('sinistre_')) {
      return this.extractOrderedInformation(state);
    }

    if (state.conversationType.startsWith('devis_')) {
      return this.extractDevisInformation(state);
    }

    const extractionPrompt = `Extract ONLY NEW information from the current message.

CURRENT MESSAGE: "${textOf(lastMessage)}"
${hasImages ? `\nImage info available: ${state.imageAnalysis.length} photos` : ''}

CONVERSATION TYPE: ${state.conversationType}

ALREADY COLLECTED DATA (DO NOT re-extract):
${JSON.stringify(state.extractedData || {}, null, 2)}

IMPORTANT RULES:
1. ONLY extract NEW information from the CURRENT message
2. Do NOT re-extract or override already collected data
3. Do NOT include null or empty values
4. Only include fields that are EXPLICITLY mentioned in current message

Extract fields relevant to ${state.conversationType}.

Respond with JSON containing ONLY NEW fields:
{
  "extractedData": {"field": "value"},
  "missingInfo": ["field1", "field2"]
}

If no new information, return: {"extractedData": {}, "missingInfo": [...]}`;

    try {
      const messages = this.aiClient.convertLangChainMessages([new HumanMessage(extractionPrompt)]);
      const response = await this.chat(messages, {
        temperature: 0.3,
        maxTokens: 512,
        json: true,
      });

      const extraction = parseJsonObject(response.content);
      let newData = extraction.extractedData || {};

      newData = Object.fromEntries(
        Object.entries(newData).filter(
          ([_, value]) => value !== null && value !== undefined && value !== '',
        ),
      );

      return {
        extractedData: newData,
        missingInfo: extraction.missingInfo || [],
      };
    } catch (error) {
      this.failTurnOnProviderError(error);
      this.logger.error('Extraction error:', error);
      return {
        extractedData: {},
        missingInfo: [],
      };
    }
  }

  /** Progress of a claim declaration as it stands: used when a turn adds nothing new. */
  private claimProgress(state: typeof GraphState.State) {
    const missingInfo = SINISTRE_FIELDS_ORDER.filter((field) => !state.extractedData?.[field]);
    return {
      missingInfo,
      currentFieldIndex: SINISTRE_FIELDS_ORDER.length - missingInfo.length,
    };
  }

  private async extractOrderedInformation(state: typeof GraphState.State) {
    const lastMessage = state.messages.at(-1)!;
    const hasImages = state.imageAnalysis && state.imageAnalysis.length > 0;

    // Check if user is confirming or wants modifications
    if (state.awaitingConfirmation) {
      const confirmationPrompt = `Analyze this message to determine if the user is confirming or requesting modifications.

CURRENT MESSAGE: "${textOf(lastMessage)}"
Language: ${state.language}

Does the user:
1. Confirm/agree to proceed? (words like: oui, yes, ok, confirme, d'accord, correct, نعم, موافق, etc.)
2. Want to modify something? (mentions specific field to change)
3. Reject/cancel? (words like: non, no, annuler, cancel, لا, etc.)

Respond with JSON:
{
  "action": "confirm|modify|cancel",
  "fieldToModify": "fieldName or null",
  "newValue": "value or null"
}`;

      try {
        const messages = this.aiClient.convertLangChainMessages([
          new HumanMessage(confirmationPrompt),
        ]);
        const response = await this.chat(messages, {
          temperature: 0.3,
          maxTokens: 256,
          json: true,
        });

        const confirmation = parseJsonObject(response.content);

        if (confirmation.action === 'confirm') {
          return {
            isComplete: true,
            awaitingConfirmation: false,
          };
        } else if (confirmation.action === 'modify' && confirmation.fieldToModify) {
          const updatedData = { ...state.extractedData };
          if (confirmation.newValue) {
            updatedData[confirmation.fieldToModify] = confirmation.newValue;
          } else {
            delete updatedData[confirmation.fieldToModify];
          }

          const missingFields = SINISTRE_FIELDS_ORDER.filter((field) => !updatedData[field]);
          const currentIndex = SINISTRE_FIELDS_ORDER.length - missingFields.length;

          return {
            // replace, so a field the user asked to remove is really gone
            extractedData: replaceWith(updatedData),
            missingInfo: missingFields,
            currentFieldIndex: currentIndex,
            awaitingConfirmation: false,
          };
        } else if (confirmation.action === 'cancel') {
          return {
            extractedData: replaceWith({}),
            imageAnalysis: replaceWith([]),
            missingInfo: SINISTRE_FIELDS_ORDER,
            currentFieldIndex: 0,
            awaitingConfirmation: false,
          };
        }
      } catch (error) {
        this.failTurnOnProviderError(error);
        this.logger.error('Confirmation extraction error:', error);
      }
    }

    // ✅ AUTOMATICALLY POPULATE DAMAGED PARTS/AREAS FROM IMAGES
    let imageDetectedParts: string[] = [];
    if (hasImages && state.imageAnalysis && state.imageAnalysis.length > 0) {
      state.imageAnalysis.forEach((img: any) => {
        const parts = img.damagedParts || img.affectedAreas || [];
        if (Array.isArray(parts)) {
          imageDetectedParts.push(...parts);
        }
      });

      imageDetectedParts = [...new Set(imageDetectedParts)];

      this.logger.log(`✅ Image-detected damaged areas: ${JSON.stringify(imageDetectedParts)}`);
    }

    const extractionPrompt = `Extract ONLY NEW information from this CURRENT message.

CURRENT MESSAGE: "${textOf(lastMessage)}"
Language: ${state.language}
Sinister Type: ${state.extractedData.typeSinistre || 'unknown'}
${hasImages ? `Images analyzed: ${state.imageAnalysis.length}` : ''}
${imageDetectedParts.length > 0 ? `\nDamaged areas detected from images: ${imageDetectedParts.join(', ')}` : ''}

ALREADY COLLECTED DATA (DO NOT re-extract these):
${JSON.stringify(state.extractedData || {}, null, 2)}

FIELDS TO LOOK FOR (only extract if present in CURRENT message):
- typeSinistre: Type (accident, feu, vol, endommage d'eau, autre_type)
- dateSinistre: Date (normalize to YYYY-MM-DD, MUST NOT be in the future - today is acceptable)
  * CRITICAL: Extract the DATE from ANY natural language phrase, regardless of surrounding words
  * Ignore all prefixes, prepositions, and phrases around the date (they are just grammar, NOT indicators of future dates)
  * Examples:
    - "le 25 octobre 2025" → Extract "25 octobre 2025" → normalize to "2025-10-25"
    - "the incident happened on the 25th of October 2025" → Extract "25th October 2025" → normalize to "2025-10-25"
    - "it was on 25 October 2025" → Extract "25 October 2025" → normalize to "2025-10-25"
    - "c'était le 25 octobre 2025" → Extract "25 octobre 2025" → normalize to "2025-10-25"
    - "l'accident s'est produit le 25 octobre 2025" → Extract "25 octobre 2025" → normalize to "2025-10-25"
  * Words to IGNORE (they are just grammar, not date indicators): "le", "the", "on", "of", "à", "en", "c'était", "it was", "happened", "produit", etc.
  * ALWAYS extract the actual date value (day, month, year) regardless of how it's phrased
  * The ONLY thing that matters is: is the DATE itself today or in the past? Ignore all surrounding words
- heureSinistre: Time (normalize to HH:MM)
- lieuSinistre: Location (extract as provided by user - we will validate separately)
- descriptionIncident: Detailed description
- partiesEndommagees: Damaged parts/areas (USE IMAGE-DETECTED AREAS IF AVAILABLE)
- photos: If user says "non", "no", "pas de photos", "no photos", extract as "non_provided" but DO NOT mark as collected

CURRENT DATE: ${this.dateValidationService.getCurrentDateString()}

IMPORTANT RULES:
1. ONLY extract information from the CURRENT message
2. If images were analyzed and damaged areas were detected, include those in partiesEndommagees
3. Do NOT re-extract already collected data
4. Do NOT include null or empty values
5. For damaged parts: merge text descriptions with image-detected areas
6. For dates: 
   - Extract the DATE VALUE from ANY natural language phrase, ignoring all grammar words around it
   - Prefixes like "le", "the", "on", "of", "à", "en" are just grammar - they do NOT indicate future dates
   - Phrases like "happened on", "c'était le", "it was on" are just grammar - ignore them and extract the date
   - ACCEPT today's date and past dates. ONLY reject dates that are TOMORROW or later (based on the actual date value, not the words around it)
   - Examples: "happened on the 25th of October 2025" → Extract date "2025-10-25" → Validate if it's today or past
   - Examples: "le 25 octobre 2025" → Extract date "2025-10-25" → Validate if it's today or past
7. For locations: Extract the location as provided - validation will be done separately
8. If user provides a future date (tomorrow or later), return {"error": "future_date", "message": "..."}
9. For photos: If user says they don't have photos (non, no, pas de photos, etc.), extract photos as "non_provided" but still mark as missing so agent can ask again

DATE VALIDATION EXAMPLES:
- "le 25 octobre 2025" → Extract "25 octobre 2025" → Parse as "2025-10-25" → ACCEPT if today or past
- "the incident happened on the 25th of October 2025" → Extract "25th October 2025" → Parse as "2025-10-25" → ACCEPT if today or past
- "it was on 25 October 2025" → Extract "25 October 2025" → Parse as "2025-10-25" → ACCEPT if today or past
- "c'était le 25 octobre 2025" → Extract "25 octobre 2025" → Parse as "2025-10-25" → ACCEPT if today or past
- Today (${this.dateValidationService.getCurrentDateString()}): ACCEPT
- Yesterday: ACCEPT  
- Tomorrow: REJECT
- Next week: REJECT

Respond with JSON containing ONLY the NEW fields from current message:
{
  "extractedData": {"field": "value"}
}`;

    try {
      const messages = this.aiClient.convertLangChainMessages([new HumanMessage(extractionPrompt)]);
      const response = await this.chat(messages, {
        temperature: 0.3,
        maxTokens: 512,
        json: true,
      });

      const extraction = parseJsonObject(response.content);

      // ✅ HANDLE FUTURE DATE ERROR
      if (extraction.error === 'future_date') {
        this.logger.warn('User provided future date, rejecting extraction');
        return {
          ...this.claimProgress(state),
          error: extraction.error,
          errorMessage: extraction.message,
        };
      }

      let newData = extraction.extractedData || {};

      // ✅ DATE VALIDATION USING DateValidationService
      if (newData.dateSinistre) {
        // Strip any time component from date if it was accidentally included
        let dateOnly = newData.dateSinistre;
        if (typeof dateOnly === 'string' && dateOnly.includes('T')) {
          dateOnly = dateOnly.split('T')[0];
          newData.dateSinistre = dateOnly;
          this.logger.debug(`Stripped time from date: ${newData.dateSinistre}`);
        }

        const dateValidation = this.dateValidationService.validateDate(newData.dateSinistre);
        if (!dateValidation.isValid) {
          this.logger.warn(`Invalid date format: ${newData.dateSinistre}`);
          return {
            ...this.claimProgress(state),
            error: 'invalid_date',
            errorMessage: this.dateValidationService.getDateErrorMessage(
              newData.dateSinistre,
              state.language,
            ),
          };
        }

        if (dateValidation.isFuture) {
          this.logger.warn(`Future date rejected: ${newData.dateSinistre}`);
          return {
            ...this.claimProgress(state),
            error: 'future_date',
            errorMessage: this.dateValidationService.getDateErrorMessage(
              newData.dateSinistre,
              state.language,
            ),
          };
        }

        this.logger.debug(
          `Date validation passed: ${newData.dateSinistre}, isToday: ${dateValidation.isToday}, daysDifference: ${dateValidation.daysDifference}`,
        );
      }

      // ✅ TIME VALIDATION FOR TODAY'S DATE
      if (newData.dateSinistre && newData.heureSinistre) {
        this.logger.log(
          `Validating time for date: ${newData.dateSinistre}, time: ${newData.heureSinistre}`,
        );
        const dateValidation = this.dateValidationService.validateDate(newData.dateSinistre);

        this.logger.log(
          `Date validation: isToday=${dateValidation.isToday}, isFuture=${dateValidation.isFuture}, daysDifference=${dateValidation.daysDifference}`,
        );

        if (dateValidation.isToday) {
          this.logger.log(`✅ Date is today, validating time against current time`);
          const timeValidation = this.dateValidationService.validateTime(newData.heureSinistre);

          this.logger.log(
            `Time validation: isValid=${timeValidation.isValid}, isFuture=${timeValidation.isFuture}, formatted=${timeValidation.formattedTime}`,
          );

          if (!timeValidation.isValid) {
            this.logger.warn(`❌ Invalid time format: ${newData.heureSinistre}`);
            return {
              ...this.claimProgress(state),
              error: 'invalid_time',
              errorMessage: timeValidation.errorMessage || 'Invalid time format',
            };
          }

          if (timeValidation.isFuture) {
            this.logger.warn(
              `❌ Future time rejected for today's date: ${newData.heureSinistre} (current time: ${new Date().toTimeString().slice(0, 5)})`,
            );
            return {
              ...this.claimProgress(state),
              error: 'future_time',
              errorMessage: byLanguage(
                state.language,
                {
                  fr: `L'heure de l'incident ne peut pas être dans le futur pour la date d'aujourd'hui. Veuillez fournir une heure passée ou actuelle.`,
                  ar: `لا يمكن أن يكون وقت الحادث في المستقبل لتاريخ اليوم. يرجى تقديم وقت ماضٍ أو حالي.`,
                },
                `The incident time cannot be in the future for today's date. Please provide a past or current time.`,
              ),
            };
          }

          this.logger.log(
            `✅ Time validation passed for today: ${newData.heureSinistre}, isFuture: ${timeValidation.isFuture}`,
          );
        } else {
          this.logger.log(
            `⏭️ Skipping time validation - date is not today (isToday=${dateValidation.isToday})`,
          );
        }
      }

      // ✅ LOCATION VALIDATION USING LocationValidationService
      if (newData.lieuSinistre) {
        if (typeof newData.lieuSinistre === 'string') {
          newData.lieuSinistre = newData.lieuSinistre.trim();
        }

        this.logger.log(`🔍 Validating location: "${newData.lieuSinistre}"`);

        const locationValidation = await this.locationValidationService.validateLocationWithMessage(
          newData.lieuSinistre,
          state.language,
        );

        if (!locationValidation.isValid) {
          this.logger.warn(`❌ Location validation failed: ${locationValidation.errorMessage}`);
          return {
            ...this.claimProgress(state),
            error: 'invalid_location',
            errorMessage:
              locationValidation.errorMessage ||
              byLanguage(
                state.language,
                {
                  fr: 'Veuillez entrer une adresse valide (ville, adresse complète ou lieu spécifique).',
                  ar: 'يرجى إدخال عنوان صالح (مدينة، عنوان كامل أو مكان محدد).',
                },
                'Please enter a valid address (city, full address, or specific location).',
              ),
          };
        }

        // Use the formatted address from validation if available
        if (locationValidation.formattedAddress) {
          newData.lieuSinistre = locationValidation.formattedAddress;
          this.logger.log(
            `✅ Location validated and formatted: "${newData.lieuSinistre}" (confidence: ${locationValidation.confidence?.toFixed(2) || 'N/A'})`,
          );
        } else {
          this.logger.log(`✅ Location accepted: "${newData.lieuSinistre}"`);
        }

        if (locationValidation.coordinates) {
          this.logger.debug(
            `📍 Coordinates: lat=${locationValidation.coordinates.lat}, lon=${locationValidation.coordinates.lon}`,
          );
        }
      }

      newData = Object.fromEntries(
        Object.entries(newData).filter(
          ([_, value]) => value !== null && value !== undefined && value !== '',
        ),
      );

      // ✅ HANDLE PHOTO INFO
      const currentPhotoCount = state.extractedData.photos
        ? Number.parseInt(state.extractedData.photos.match(/\d+/)?.[0] || '0')
        : 0;
      const actualPhotoCount = state.imageAnalysis?.length || 0;

      // Check if user declined to provide photos BEFORE processing
      const lastMessageContent =
        typeof lastMessage.content === 'string' ? lastMessage.content.trim().toLowerCase() : '';
      const userDeclinedPhotos =
        newData.photos === 'non_provided' ||
        newData.photos === 'no' ||
        newData.photos === 'non' ||
        /^(non|no|pas de photos?|no photos?|je n'ai pas|j'ai pas|ja' pas|i don't have|don't have|n'ai pas|na pas)/i.test(
          lastMessageContent,
        ) ||
        /\b(pas de photos?|no photos?|n'ai pas de photos?|na pas de photos?|don't have photos?)\b/i.test(
          lastMessageContent,
        );

      // Handle when user says they don't have photos
      if (userDeclinedPhotos) {
        this.logger.log('User indicated they do not have photos');
        delete newData.photos;
      } else if (
        hasImages &&
        (!state.extractedData.photos || actualPhotoCount !== currentPhotoCount)
      ) {
        newData.photos = `${actualPhotoCount} photo(s) reçue(s)`;
        newData.hasPhotos = true;
      }

      // ✅ MERGE DAMAGED PARTS
      const existingPartsFromState = this.parsePartiesEndommagees(
        state.extractedData.partiesEndommagees || '',
      );
      const existingPartsFromMessage = newData.partiesEndommagees
        ? this.parsePartiesEndommagees(newData.partiesEndommagees)
        : [];

      const allExistingParts = [
        ...new Set([...existingPartsFromState, ...existingPartsFromMessage]),
      ];

      if (imageDetectedParts.length > 0 || allExistingParts.length > 0) {
        const allParts = [...new Set([...allExistingParts, ...imageDetectedParts])];

        if (allParts.length > 0) {
          newData.partiesEndommagees = allParts.join(', ');
          this.logger.log(
            `✅ Merged damaged areas - User: ${JSON.stringify(allExistingParts)}, Images: ${JSON.stringify(imageDetectedParts)}, Combined: ${JSON.stringify(allParts)}`,
          );
        }
      }

      const mergedData = { ...state.extractedData, ...newData };

      const missingFields = SINISTRE_FIELDS_ORDER.filter((field) => {
        if (field === 'photos' && userDeclinedPhotos) {
          return true;
        }
        return !mergedData[field];
      });
      const currentIndex = SINISTRE_FIELDS_ORDER.length - missingFields.length;

      this.logger.log(`Extraction complete - Missing fields: ${JSON.stringify(missingFields)}`);
      if (userDeclinedPhotos) {
        this.logger.log(
          '⚠️ User declined to provide photos - will request again with language-appropriate message',
        );
      }

      return {
        extractedData: mergedData,
        missingInfo: missingFields,
        currentFieldIndex: currentIndex,
        userDeclinedPhotos: userDeclinedPhotos,
        error: '',
        errorMessage: '',
      };
    } catch (error) {
      this.failTurnOnProviderError(error);
      this.logger.error('Ordered extraction error:', error);
      return {
        ...this.claimProgress(state),
        error: '',
        errorMessage: '',
      };
    }
  }

  /**
   * Eligibility rules for quotes. They are the tenant's (config.ai.quoteRules:
   * minAge, maxAge, minBudget, maxBudget, currency); the defaults below apply
   * when a tenant sets nothing.
   */
  private quoteRules() {
    const configured = (this.tenantContext.getTenant()?.config?.ai?.quoteRules ?? {}) as Record<
      string,
      unknown
    >;
    const number = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return {
      minAge: number(configured.minAge, 19),
      maxAge: number(configured.maxAge, 100),
      minBudget: number(configured.minBudget, 30000),
      maxBudget: number(configured.maxBudget, 1000000),
      currency: typeof configured.currency === 'string' ? configured.currency : 'DZD',
    };
  }

  private minAgeMessage(language: Language): string {
    const { minAge } = this.quoteRules();
    return byLanguage(
      language,
      {
        fr: `L'âge minimum requis est de ${minAge} ans pour souscrire à une assurance.`,
        en: `The minimum required age is ${minAge} years to subscribe to insurance.`,
      },
      `الحد الأدنى للعمر المطلوب هو ${minAge} سنة للاشتراك في التأمين.`,
    );
  }

  private minBudgetMessage(language: Language): string {
    const { minBudget, currency } = this.quoteRules();
    return byLanguage(
      language,
      {
        fr: `Le budget minimum requis est de ${minBudget} ${currency} par mois.`,
        en: `The minimum required budget is ${minBudget} ${currency} per month.`,
      },
      `الحد الأدنى للميزانية المطلوبة هو ${minBudget} ${currency} شهريًا.`,
    );
  }

  private validateDevisAge(
    age: any,
    language: Language,
  ): { isValid: boolean; errorMessage?: string } {
    const { minAge, maxAge } = this.quoteRules();
    const ageNum = Number.parseInt(age);

    if (Number.isNaN(ageNum)) {
      return {
        isValid: false,
        errorMessage: byLanguage(
          language,
          {
            fr: "L'âge doit être un nombre valide.",
            en: 'Age must be a valid number.',
          },
          'يجب أن يكون العمر رقمًا صالحًا.',
        ),
      };
    }

    if (ageNum < minAge) {
      return { isValid: false, errorMessage: this.minAgeMessage(language) };
    }

    if (ageNum > maxAge) {
      return {
        isValid: false,
        errorMessage: byLanguage(
          language,
          {
            fr: `Veuillez fournir un âge valide (maximum ${maxAge} ans).`,
            en: `Please provide a valid age (maximum ${maxAge} years).`,
          },
          `يرجى تقديم عمر صالح (بحد أقصى ${maxAge} سنة).`,
        ),
      };
    }

    return { isValid: true };
  }

  private validateDevisBudget(
    budget: any,
    language: Language,
  ): { isValid: boolean; errorMessage?: string } {
    const { minBudget, maxBudget, currency } = this.quoteRules();
    const budgetNum = Number.parseFloat(budget);

    if (Number.isNaN(budgetNum)) {
      return {
        isValid: false,
        errorMessage: byLanguage(
          language,
          {
            fr: 'Le budget doit être un nombre valide.',
            en: 'Budget must be a valid number.',
          },
          'يجب أن تكون الميزانية رقمًا صالحًا.',
        ),
      };
    }

    if (budgetNum < minBudget) {
      return { isValid: false, errorMessage: this.minBudgetMessage(language) };
    }

    if (budgetNum > maxBudget) {
      return {
        isValid: false,
        errorMessage: byLanguage(
          language,
          {
            fr: `Veuillez fournir un budget réaliste (maximum ${maxBudget} ${currency}).`,
            en: `Please provide a realistic budget (maximum ${maxBudget} ${currency}).`,
          },
          `يرجى تقديم ميزانية واقعية (بحد أقصى ${maxBudget} ${currency}).`,
        ),
      };
    }

    return { isValid: true };
  }

  private async extractDevisInformation(state: typeof GraphState.State) {
    const lastMessage = state.messages.at(-1)!;

    if (state.awaitingConfirmation) {
      const confirmationAction = this.interpretDevisConfirmation(
        (lastMessage.content as string) || '',
        state.language as Language,
      );

      if (confirmationAction === 'confirm') {
        this.logger.log('✅ User confirmed devis information.');
        // Clear any lingering error upon successful confirmation
        return {
          awaitingConfirmation: false,
          error: '', // Clear error
          errorMessage: '', // Clear error message
        };
      }

      if (confirmationAction === 'cancel') {
        this.logger.log('⚠️ User cancelled devis process. Resetting collected data.');
        const requiredFields = this.getRequiredFieldsForDevis(state.conversationType);
        const uniqueFields = Array.from(new Set(requiredFields));

        return {
          awaitingConfirmation: false,
          extractedData: {},
          missingInfo: uniqueFields,
          devisStep: 'collecting',
          recommendedDevis: [],
          selectedDevisId: '',
          selectedOrderingNumber: 0,
          error: '', // Clear error on cancel
          errorMessage: '', // Clear error message on cancel
        };
      }

      if (confirmationAction === 'modify') {
        this.logger.log('🛠️ User wants to modify devis information. Reopening data collection.');
        const requiredFields = this.getRequiredFieldsForDevis(state.conversationType);
        const uniqueFields = Array.from(new Set(requiredFields));

        return {
          awaitingConfirmation: false,
          missingInfo: uniqueFields,
          devisStep: 'collecting',
          recommendedDevis: [],
          selectedDevisId: '',
          selectedOrderingNumber: 0,
          error: '', // Clear error on modify
          errorMessage: '', // Clear error message on modify
        };
      }

      this.logger.log('ℹ️ Confirmation response not understood. Asking again.');
      return {
        awaitingConfirmation: true,
      };
    }

    // Handle devis selection
    if (state.devisStep === 'showing_options') {
      const selectionResult = this.parseDevisSelection(
        lastMessage.content as string,
        state.recommendedDevis,
      );
      if (selectionResult) {
        // Clear error upon successful selection
        return {
          selectedDevisId: selectionResult.devisId,
          devisStep: 'showing_details',
          selectedOrderingNumber: selectionResult.orderingNumber,
          error: '', // Clear error on selection
          errorMessage: '', // Clear error message on selection
        };
      }
    }

    // Handle devis details navigation
    if (state.devisStep === 'showing_details') {
      const navigationResult = this.parseDevisNavigation(lastMessage.content as string);
      if (navigationResult) {
        // Clear error upon successful navigation
        return {
          devisStep: navigationResult.step,
          selectedDevisId: navigationResult.step === 'showing_options' ? '' : state.selectedDevisId,
          error: '', // Clear error on navigation
          errorMessage: '', // Clear error message on navigation
        };
      }
    }

    const hasProductType = state.extractedData?.productType;

    if (!hasProductType) {
      const productTypeExtractionPrompt = `Analyze this message to determine if the user is selecting an insurance product type.

CURRENT MESSAGE: "${textOf(lastMessage)}"
Language: ${state.language}

Available insurance types (match by number OR keyword):
1. Assurance automobile (auto, car, voiture, véhicule) → "auto"
2. Assurance automobile avec paiement fractionné (auto fractionné) → "auto_fractional"
3. Assurance habitation (habitation, maison, logement, home) → "habitation"
4. Assurance scolaire (scolaire, école, school) → "scolaire"
5. Assurance bateau de plaisance (bateau, boat) → "bateau"
6. Assurance catastrophes naturelles (catnat, catastrophe, natural disaster) → "catnat"
7. Assurance multirisques professionnelle (mrp, professionnel, business) → "mrp"

IMPORTANT:
- If user mentions ONLY "devis" or "quote" without a specific type → return null
- If user says a NUMBER (1-7) → map to corresponding type
- If user mentions KEYWORDS → map to corresponding type
- Be strict: only extract if user is CLEARLY choosing a type

Respond with JSON:
{
  "productType": "auto|auto_fractional|habitation|scolaire|bateau|catnat|mrp|null"
}`;

      try {
        const messages = this.aiClient.convertLangChainMessages([
          new HumanMessage(productTypeExtractionPrompt),
        ]);
        const response = await this.chat(messages, {
          temperature: 0.3,
          maxTokens: 256,
          json: true,
        });

        const extraction = parseJsonObject(response.content);
        const rawProductTypeValue = extraction.productType;
        const rawProductType =
          typeof rawProductTypeValue === 'string'
            ? rawProductTypeValue.trim()
            : rawProductTypeValue;

        if (
          rawProductType &&
          !['null', 'undefined', 'none'].includes(rawProductType.toString().toLowerCase())
        ) {
          const { canonical, slug, isAlias } = this.resolveProductType(rawProductType.toString());
          const normalizedProductType = canonical || slug;

          if (normalizedProductType) {
            const vehicleFieldNeeded = this.isVehicleProductType(normalizedProductType);
            const conversationType = this.mapProductTypeToConversationType(
              normalizedProductType,
              state.conversationType as ConversationType,
            );

            const productTypeData: Record<string, any> = {
              productType: normalizedProductType,
            };

            const rawProductTypeString = rawProductType.toString();
            if (
              rawProductTypeString &&
              (rawProductTypeString !== normalizedProductType || !isAlias)
            ) {
              productTypeData.productTypeLabel = rawProductTypeString;
            }

            // Clear error upon successful product type extraction
            return {
              extractedData: productTypeData,
              missingInfo: [
                'age',
                'codePostal',
                'budget',
                ...(vehicleFieldNeeded ? ['vehicleType'] : []),
              ],
              conversationType,
              error: '', // Clear error
              errorMessage: '', // Clear error message
            };
          }
        }

        // Clear error if extraction failed but wasn't due to invalid input related to age/budget
        // This might not be ideal if the *lack* of product type itself is an error state managed elsewhere,
        // but clearing here prevents sticking on a *previous* error if this step is re-attempted.
        return {
          extractedData: {},
          missingInfo: ['productType', 'age', 'codePostal', 'budget', 'vehicleType'],
          error: '', // Clear previous error
          errorMessage: '', // Clear previous error message
        };
      } catch (error) {
        this.failTurnOnProviderError(error);
        this.logger.error('Product type extraction error:', error);
        // Clear error if the extraction process itself failed
        return {
          extractedData: {},
          missingInfo: ['productType', 'age', 'codePostal', 'budget', 'vehicleType'],
          error: '', // Clear previous error on process failure
          errorMessage: '', // Clear previous error message on process failure
        };
      }
    }

    // ✅ SPECIAL HANDLING FOR VEHICLE TYPE - Direct keyword matching
    const messageContent = ((lastMessage.content as string) || '').toLowerCase().trim();
    const needsVehicleType = state.missingInfo.includes('vehicleType');

    if (needsVehicleType) {
      // Direct keyword matching for vehicle types
      const vehicleTypeMapping: Record<string, string> = {
        voiture: 'car',
        car: 'car',
        automobile: 'car',
        véhicule: 'car',
        vehicle: 'car',
        moto: 'motorcycle',
        motorcycle: 'motorcycle',
        motorbike: 'motorcycle',
        bike: 'motorcycle',
        scooter: 'motorcycle',
        camion: 'truck',
        truck: 'truck',
        van: 'truck',
        pickup: 'truck',
        utilitaire: 'truck',
      };

      for (const [keyword, vehicleType] of Object.entries(vehicleTypeMapping)) {
        if (messageContent.includes(keyword)) {
          this.logger.log(`✅ Directly matched vehicle type: ${keyword} → ${vehicleType}`);

          const mergedData: Record<string, any> = {
            ...state.extractedData,
            vehicleType,
          };

          const requiredFields = ['productType', 'age', 'codePostal', 'budget', 'vehicleType'];
          const missingFields = requiredFields.filter((field) => !mergedData[field]);

          this.logger.log(`Vehicle type extracted: ${vehicleType}`);
          this.logger.log(`Merged data: ${JSON.stringify(mergedData)}`);
          this.logger.log(`Missing fields: ${JSON.stringify(missingFields)}`);

          let conversationTypeUpdate: ConversationType | undefined = undefined;
          if (mergedData.productType) {
            conversationTypeUpdate = this.mapProductTypeToConversationType(
              mergedData.productType,
              state.conversationType as ConversationType,
            );
          }

          // ✅ If all fields collected, trigger devis generation
          if (missingFields.length === 0) {
            this.logger.log('🎉 All devis fields collected! Triggering confirmation...');
            // Clear error upon successful completion of data collection
            const completionPayload: Record<string, any> = {
              extractedData: mergedData,
              missingInfo: [],
              isComplete: false,
              devisStep: 'collecting',
              awaitingConfirmation: true, // ✅ Trigger confirmation
              error: '', // Clear error
              errorMessage: '', // Clear error message
            };

            if (conversationTypeUpdate) {
              completionPayload.conversationType = conversationTypeUpdate;
            }

            return completionPayload;
          }

          // Clear error upon successful vehicle type extraction
          const responsePayload: Record<string, any> = {
            extractedData: mergedData,
            missingInfo: missingFields,
            error: '', // Clear error
            errorMessage: '', // Clear error message
          };

          if (conversationTypeUpdate) {
            responsePayload.conversationType = conversationTypeUpdate;
          }

          return responsePayload;
        }
      }
    }

    // ✅ Extract other devis fields using AI (for non-vehicle-type fields)
    const extractionPrompt = `Extract ONLY NEW information from this CURRENT message for insurance quote request.

CURRENT MESSAGE: "${textOf(lastMessage)}"
Language: ${state.language}
Product Type: ${state.extractedData.productType}

ALREADY COLLECTED DATA (DO NOT re-extract these):
${JSON.stringify(state.extractedData || {}, null, 2)}

FIELDS TO LOOK FOR (only extract if present in CURRENT message):
- age: Age (number) - MUST be at least ${this.quoteRules().minAge} years old and maximum ${this.quoteRules().maxAge} years
- codePostal: Postal code (string)
- budget: Monthly budget (number) - MUST be at least 30,000 DZD (Algerian Dinar)
- vehicleType: Vehicle type - MUST map to one of these EXACT values:
  * "car" (for: voiture, automobile, car, vehicle, véhicule)
  * "motorcycle" (for: moto, motorcycle, motorbike, bike, scooter)
  * "truck" (for: camion, truck, van, pickup, utilitaire)

IMPORTANT RULES:
1. ONLY extract information from the CURRENT message
2. Do NOT re-extract already collected data
3. Do NOT include null or empty values
4. Do NOT extract productType again (already collected)
5. For vehicleType: ALWAYS use one of the three exact values: "car", "motorcycle", or "truck"
6. Map French/English terms to the correct English value
7. Age: Must be between ${this.quoteRules().minAge} and ${this.quoteRules().maxAge} years
8. Budget: Must be at least ${this.quoteRules().minBudget} ${this.quoteRules().currency}
9. If age < ${this.quoteRules().minAge}, return {"error": "invalid_age", "message": "${this.minAgeMessage(Language.FRENCH)}"} (for French)
10. If budget < ${this.quoteRules().minBudget}, return {"error": "invalid_budget", "message": "${this.minBudgetMessage(Language.FRENCH)}"} (for French)

EXAMPLES:
- "voiture" → {"vehicleType": "car"}
- "moto" → {"vehicleType": "motorcycle"}
- "camion" → {"vehicleType": "truck"}

Respond with JSON containing ONLY the NEW fields from current message and potentially an error:
{
  "extractedData": {"field": "value"},
  "error": "optional_error_code",
  "message": "optional_error_message"
}`;

    try {
      const messages = this.aiClient.convertLangChainMessages([new HumanMessage(extractionPrompt)]);
      const response = await this.chat(messages, {
        temperature: 0.3,
        maxTokens: 512,
        json: true,
      });

      const extraction = parseJsonObject(response.content);

      // Check if the AI returned an error based on the current message content
      if (extraction.error) {
        this.logger.warn(`❌ AI detected error in message: ${textOf(lastMessage)}`, {
          // sessionId: state.sessionId, // REMOVED - Cannot access sessionId directly from state here
          language: state.language,
          aiError: extraction.error,
          aiMessage: extraction.message,
        });
        // Return the state indicating the specific error found in the current message
        return {
          extractedData: {}, // Don't pass potentially invalid data forward from the current message
          missingInfo: state.missingInfo, // Keep the list of missing info as is
          error: extraction.error, // e.g., 'invalid_age', 'invalid_budget'
          errorMessage: extraction.message, // The translated error message from the AI
        };
      }

      let newData = extraction.extractedData || {};

      // Clean null/empty values
      newData = Object.fromEntries(
        Object.entries(newData).filter(
          ([_, value]) => value !== null && value !== undefined && value !== '',
        ),
      );

      // --- FIX: Explicitly clear error state upon successful extraction of *any* new data ---
      // This is crucial. If the AI successfully extracts NEW data (like age 19 after an error),
      // the error state should be cleared *before* any further processing or merging.
      const updatedState = { ...state, error: '', errorMessage: '' };

      // ✅ AGE VALIDATION (using the updated state's extractedData if needed for context)
      if (newData.age) {
        const ageValidation = this.validateDevisAge(newData.age, updatedState.language);
        if (!ageValidation.isValid) {
          this.logger.warn(`Invalid age provided: ${newData.age}`);
          return {
            extractedData: {}, // Don't pass invalid data forward
            missingInfo: updatedState.missingInfo || ['productType', 'age', 'codePostal', 'budget'],
            error: 'invalid_age',
            errorMessage: ageValidation.errorMessage,
          };
        }
      }

      // ✅ BUDGET VALIDATION (using the updated state's extractedData if needed for context)
      if (newData.budget) {
        const budgetValidation = this.validateDevisBudget(newData.budget, updatedState.language);
        if (!budgetValidation.isValid) {
          this.logger.warn(`Invalid budget provided: ${newData.budget}`);
          return {
            extractedData: {}, // Don't pass invalid data forward
            missingInfo: updatedState.missingInfo || ['productType', 'age', 'codePostal', 'budget'],
            error: 'invalid_budget',
            errorMessage: budgetValidation.errorMessage,
          };
        }
      }

      // ✅ Normalize vehicleType if extracted by AI
      if (newData.vehicleType) {
        const normalizedVehicleType = newData.vehicleType.toLowerCase();
        if (
          ['car', 'voiture', 'automobile', 'vehicle', 'véhicule'].includes(normalizedVehicleType)
        ) {
          newData.vehicleType = 'car';
        } else if (
          ['motorcycle', 'moto', 'motorbike', 'bike', 'scooter'].includes(normalizedVehicleType)
        ) {
          newData.vehicleType = 'motorcycle';
        } else if (
          ['truck', 'camion', 'van', 'pickup', 'utilitaire'].includes(normalizedVehicleType)
        ) {
          newData.vehicleType = 'truck';
        }
        this.logger.log(`✅ AI extracted and normalized vehicle type: ${newData.vehicleType}`);
      }

      // Merge with existing data (using the updated state's extractedData as the base)
      const mergedData = { ...updatedState.extractedData, ...newData }; // Use updatedState here

      // Determine which fields are still missing
      const requiredFields = ['productType', 'age', 'codePostal', 'budget'];
      if (this.isVehicleProductType(mergedData.productType)) {
        requiredFields.push('vehicleType');
      }

      const missingFields = requiredFields.filter((field) => !mergedData[field]);

      this.logger.log(`Devis extraction - Collected: ${JSON.stringify(mergedData)}`);
      this.logger.log(`Devis extraction - Missing: ${JSON.stringify(missingFields)}`);

      const conversationTypeUpdate = mergedData.productType
        ? this.mapProductTypeToConversationType(
            mergedData.productType,
            updatedState.conversationType as ConversationType, // Use updatedState here
          )
        : undefined;

      // ✅ If all fields collected, trigger confirmation
      if (missingFields.length === 0) {
        this.logger.log('🎉 All devis fields collected! Triggering confirmation...');
        // Clear error upon successful completion of data collection
        const completionPayload: Record<string, any> = {
          extractedData: mergedData,
          missingInfo: [],
          isComplete: false,
          devisStep: 'collecting',
          awaitingConfirmation: true, // ✅ Trigger confirmation
          error: '', // Ensure error is cleared again before confirmation
          errorMessage: '', // Ensure error message is cleared again before confirmation
        };

        if (conversationTypeUpdate) {
          completionPayload.conversationType = conversationTypeUpdate;
        }

        return completionPayload;
      }

      // Return the response payload with the cleared error state
      const responsePayload: Record<string, any> = {
        extractedData: newData, // Only return the *newly* extracted data from this message
        missingInfo: missingFields,
        error: '', // Ensure error is cleared
        errorMessage: '', // Ensure error message is cleared
      };

      if (conversationTypeUpdate) {
        responsePayload.conversationType = conversationTypeUpdate;
      }

      return responsePayload;
    } catch (error) {
      this.failTurnOnProviderError(error);
      this.logger.error('Devis field extraction error:', error);
      // Clear error if the extraction process itself failed, potentially recovering from a stuck error state
      return {
        extractedData: state.extractedData,
        missingInfo: state.missingInfo,
        error: '', // Clear previous error on process failure
        errorMessage: '', // Clear previous error message on process failure
      };
    }
  }

  private parseDevisSelection(
    message: string,
    recommendedDevis: any[],
  ): { devisId: string; orderingNumber?: number } | null {
    const lowerMessage = message.toLowerCase();

    // Look for number selection (1, 2, 3, etc.)
    const numberMatch = /(\d+)/.exec(message);
    if (numberMatch) {
      const selectedNumber = Number.parseInt(numberMatch[1]);

      // First try to find by orderingNumber
      const devisByOrdering = recommendedDevis.find((d) => d.orderingNumber === selectedNumber);
      if (devisByOrdering) {
        return { devisId: devisByOrdering.id, orderingNumber: selectedNumber };
      }

      // Fallback to index-based selection
      const index = selectedNumber - 1;
      if (index >= 0 && index < recommendedDevis.length) {
        return { devisId: recommendedDevis[index].id, orderingNumber: selectedNumber };
      }
    }

    // Look for devis ID in message
    for (const devis of recommendedDevis) {
      if (
        lowerMessage.includes(devis.id.toLowerCase()) ||
        lowerMessage.includes(devis.titleFr?.toLowerCase()) ||
        lowerMessage.includes(devis.titleEn?.toLowerCase())
      ) {
        return { devisId: devis.id, orderingNumber: devis.orderingNumber };
      }
    }

    return null;
  }

  private parseDevisNavigation(message: string): { step: string } | null {
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('retour') ||
      lowerMessage.includes('back') ||
      lowerMessage.includes('autres') ||
      lowerMessage.includes('other')
    ) {
      return { step: 'showing_options' };
    }

    if (
      lowerMessage.includes('détails') ||
      lowerMessage.includes('details') ||
      lowerMessage.includes('plus')
    ) {
      return { step: 'showing_details' };
    }

    return null;
  }

  private async validatePolicy(state: typeof GraphState.State) {
    const policyData = state.extractedData.numeroPolice || state.extractedData.email;

    if (!policyData) {
      return { policyValid: true };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const isValid = !policyData.includes('invalid');

    return {
      policyValid: isValid,
      validationResults: {
        policyChecked: true,
        policyActive: isValid,
        coverageType: state.conversationType.includes('auto') ? 'auto' : 'habitation',
      },
    };
  }

  private async checkFraud(state: typeof GraphState.State) {
    const data = state.extractedData;
    const hasImages = state.imageAnalysis && state.imageAnalysis.length > 0;

    let fraudScore = 0;

    if (!hasImages && state.conversationType.startsWith('sinistre_')) fraudScore += 20;
    if (data.montant && Number.parseFloat(data.montant) > 50000) fraudScore += 30;
    if (data.descriptionIncident && data.descriptionIncident.length < 20) fraudScore += 20;
    // (No rule on witnesses: the conversation never asks for them, so the rule
    // penalised every claim and pushed ordinary ones over the review threshold.)

    if (hasImages) fraudScore = Math.max(0, fraudScore - 20);

    const needsReview = fraudScore > 50;
    let riskLevel = 'low';
    if (fraudScore > 50) {
      riskLevel = 'high';
    } else if (fraudScore > 30) {
      riskLevel = 'medium';
    }

    return {
      fraudScore,
      needsHumanReview: needsReview,
      validationResults: {
        ...state.validationResults,
        fraudCheck: true,
        fraudScore,
        riskLevel,
        hasImageEvidence: hasImages,
      },
    };
  }

  private async generateResponse(state: typeof GraphState.State) {
    if (state.conversationType.startsWith('devis_')) {
      if (state.awaitingConfirmation) {
        const confirmationMessage = this.formatDevisConfirmationPrompt(state);
        return {
          currentResponse: confirmationMessage,
          messages: [new AIMessage(confirmationMessage)],
          awaitingConfirmation: true,
          isComplete: false,
          devisStep: state.devisStep || 'collecting',
        };
      }

      const allFieldsCollected = state.missingInfo.length === 0;
      const hasRecommendedQuotes =
        Array.isArray(state.recommendedDevis) && state.recommendedDevis.length > 0;

      if (allFieldsCollected) {
        if (!hasRecommendedQuotes) {
          const generatedQuotes = await this.generateDevisQuotes(state);
          const quotesWithOrdering = this.addOrderingNumbersToDevis(generatedQuotes || []);

          if (!quotesWithOrdering || quotesWithOrdering.length === 0) {
            const noQuoteMessage = byLanguage(
              state.language,
              {
                fr: "Aucune offre correspondante n'a été trouvée pour le moment. Souhaitez-vous ajuster vos informations ?",
                en: 'No matching offers were found. Would you like to adjust your information?',
              },
              'لم يتم العثور على عروض مطابقة. هل ترغب في تعديل معلوماتك؟',
            );

            return {
              currentResponse: noQuoteMessage,
              recommendedDevis: [],
              devisStep: 'collecting',
              messages: [new AIMessage(noQuoteMessage)],
              isComplete: false,
              awaitingConfirmation: false,
            };
          }

          const formattedQuotes = this.formatRecommendedDevisResponse(
            quotesWithOrdering,
            state.language,
          );

          return {
            currentResponse: formattedQuotes,
            recommendedDevis: quotesWithOrdering,
            devisStep: 'showing_options',
            messages: [new AIMessage(formattedQuotes)],
            isComplete: false,
            awaitingConfirmation: false,
          };
        }

        if (state.devisStep === 'collecting' || state.devisStep === 'showing_options') {
          const formattedQuotes = this.formatRecommendedDevisResponse(
            state.recommendedDevis,
            state.language,
          );

          return {
            currentResponse: formattedQuotes,
            messages: [new AIMessage(formattedQuotes)],
            devisStep: 'showing_options',
            isComplete: false,
            awaitingConfirmation: false,
          };
        }
      }
    }

    // ✅ HANDLE FUTURE DATE ERROR
    if (state.error === 'future_date') {
      this.logger.warn('Handling future date error in generateResponse');
      const errorMessage =
        state.language === 'fr'
          ? "La date de l'incident ne peut pas être dans le futur. Veuillez fournir une date d'aujourd'hui ou antérieure."
          : 'The incident date cannot be in the future. Please provide a date that is today or earlier.';

      return {
        currentResponse: state.errorMessage || errorMessage,
        isComplete: false,
        awaitingConfirmation: false,
        messages: [new AIMessage(state.errorMessage || errorMessage)],
      };
    }

    // ✅ HANDLE INVALID LOCATION ERROR
    if (state.error === 'invalid_location') {
      this.logger.warn('Handling invalid location error in generateResponse');
      const errorMessage =
        state.language === 'fr'
          ? 'Veuillez fournir un lieu réel et existant (ville, adresse ou endroit spécifique).'
          : 'Please provide a real, existing location (city, address, or specific place).';

      return {
        currentResponse: state.errorMessage || errorMessage,
        isComplete: false,
        awaitingConfirmation: false,
        messages: [new AIMessage(state.errorMessage || errorMessage)],
      };
    }

    // ✅ HANDLE INVALID TIME ERROR
    if (state.error === 'invalid_time') {
      this.logger.warn('Handling invalid time error in generateResponse');
      const errorMessage =
        state.language === 'fr'
          ? "Format d'heure invalide. Veuillez fournir une heure valide (HH:MM)."
          : 'Invalid time format. Please provide a valid time (HH:MM).';

      return {
        currentResponse: state.errorMessage || errorMessage,
        isComplete: false,
        awaitingConfirmation: false,
        messages: [new AIMessage(state.errorMessage || errorMessage)],
      };
    }

    // ✅ HANDLE FUTURE TIME ERROR
    if (state.error === 'future_time') {
      this.logger.warn('Handling future time error in generateResponse');
      const errorMessage =
        state.language === 'fr'
          ? "L'heure de l'incident ne peut pas être dans le futur pour la date d'aujourd'hui. Veuillez fournir une heure passée ou actuelle."
          : "The incident time cannot be in the future for today's date. Please provide a past or current time.";

      return {
        currentResponse: state.errorMessage || errorMessage,
        isComplete: false,
        awaitingConfirmation: false,
        messages: [new AIMessage(state.errorMessage || errorMessage)],
      };
    }
    // ✅ HANDLE INVALID AGE ERROR
    if (state.error === 'invalid_age') {
      this.logger.warn('Handling invalid age error in generateResponse');
      const errorMessage = state.errorMessage || this.minAgeMessage(state.language);

      return {
        currentResponse: errorMessage,
        isComplete: false,
        awaitingConfirmation: false,
        messages: [new AIMessage(errorMessage)],
      };
    }

    // ✅ HANDLE INVALID BUDGET ERROR
    if (state.error === 'invalid_budget') {
      this.logger.warn('Handling invalid budget error in generateResponse');
      const errorMessage = state.errorMessage || this.minBudgetMessage(state.language);

      return {
        currentResponse: errorMessage,
        isComplete: false,
        awaitingConfirmation: false,
        messages: [new AIMessage(errorMessage)],
      };
    }

    const systemPrompt = this.getSystemPromptForType(state.conversationType, state.language);
    const contextMessage = this.buildContextMessage(state);
    const instructions = this.getInstructionsForCurrentState(state);

    const needsConfirmation = state.conversationType.startsWith('devis_')
      ? false
      : state.missingInfo.length === 0 &&
        !state.awaitingConfirmation &&
        Object.keys(state.extractedData).length >= 4;

    // ✅ SPECIAL HANDLING: If user declined photos, emphasize requirement
    let photoRequirementNote = '';
    if (state.userDeclinedPhotos && state.missingInfo.includes('photos')) {
      photoRequirementNote = byLanguage(
        state.language,
        {
          fr: '\nCRITICAL: User previously said they do not have photos. You MUST clearly state that photos are REQUIRED (obligatoires) and cannot proceed without them. Be firm but polite.',
          en: '\nCRITICAL: User previously said they do not have photos. You MUST clearly state that photos are REQUIRED and cannot proceed without them. Be firm but polite.',
        },
        '\nCRITICAL: User previously said they do not have photos. You MUST clearly state that photos are REQUIRED (مطلوبة) and cannot proceed without them. Be firm but polite.',
      );
    }

    const responsePrompt = `${instructions}

${!state.policyValid ? 'IMPORTANT: Mention policy validation issue.' : ''}${photoRequirementNote}

CRITICAL: Your response MUST be brief (1-3 sentences maximum). ${needsConfirmation ? 'Show a clear summary of all collected data and ask for confirmation.' : 'Just ask the next question directly.'}

Respond naturally in ${state.language}. Be professional, empathetic, and CONCISE.`;

    try {
      const messages = this.aiClient.convertLangChainMessages([
        new SystemMessage(systemPrompt),
        new SystemMessage(contextMessage),
        ...state.messages.slice(-10),
        new HumanMessage(responsePrompt),
      ]);

      const response = await this.chat(messages, {
        temperature: 0.7,
        maxTokens: 512,
        maxContextTokens: 100000,
      });

      const awaitingConfirmation = needsConfirmation;

      return {
        currentResponse: response.content,
        isComplete: false,
        awaitingConfirmation,
        messages: [new AIMessage(response.content)],
      };
    } catch (error) {
      this.failTurnOnProviderError(error);
      this.logger.error('Generate response error:', error);

      const fallbackMessage = byLanguage(
        state.language,
        {
          fr: "Je rencontre un problème technique. Pouvez-vous répéter s'il vous plaît?",
          en: 'I am experiencing a technical issue. Could you please repeat?',
        },
        'أواجه مشكلة تقنية. هل يمكنك تكرار ذلك من فضلك؟',
      );

      return {
        currentResponse: fallbackMessage,
        isComplete: false,
        messages: [new AIMessage(fallbackMessage)],
      };
    }
  }

  /**
   * A declaration that scores high on the fraud heuristics is still registered:
   * the decision belongs to the expert, not to this assistant. The confirmation
   * message tells the user that it will be reviewed (needsHumanReview is part
   * of the completion prompt) and carries the real file number.
   */
  private async flagForReview(state: typeof GraphState.State) {
    return this.completeConversation(state);
  }

  // ============= ROUTING LOGIC =============

  private shouldRouteToCompletion(state: typeof GraphState.State): string {
    if (state.conversationType === 'non_insurance') {
      return 'generateResponse';
    }

    // Nothing is saved or flagged before the user has confirmed the declaration.
    // (Flagging used to cut the conversation short and save nothing.)
    if (state.isComplete) {
      return state.needsHumanReview && state.conversationType.startsWith('sinistre_')
        ? 'flagForReview'
        : 'complete';
    }

    return 'generateResponse';
  }

  // ============= GRAPH CONSTRUCTION =============

  private buildGraph() {
    const workflow = new StateGraph(GraphState)
      .addNode('pruneMessages', this.pruneMessages.bind(this))
      .addNode('classify', this.classifyIntent.bind(this))
      .addNode('extract', this.extractInformation.bind(this))
      .addNode('validatePolicy', this.validatePolicy.bind(this))
      .addNode('checkFraud', this.checkFraud.bind(this))
      .addNode('generateResponse', this.generateResponse.bind(this))
      .addNode('complete', this.completeConversation.bind(this))
      .addNode('flagForReview', this.flagForReview.bind(this))

      .addEdge(START, 'pruneMessages')
      .addEdge('pruneMessages', 'classify')
      .addEdge('classify', 'extract')
      .addEdge('extract', 'validatePolicy')
      .addEdge('validatePolicy', 'checkFraud')
      .addConditionalEdges('checkFraud', this.shouldRouteToCompletion.bind(this), {
        generateResponse: 'generateResponse',
        complete: 'complete',
        flagForReview: 'flagForReview',
      })
      .addEdge('generateResponse', END)
      .addEdge('complete', END)
      .addEdge('flagForReview', END);

    return workflow.compile({ checkpointer: this.checkpointer });
  }

  // ============= HELPER METHODS =============

  calculateProgress(state: any): number {
    if (state.conversationType?.startsWith('sinistre_')) {
      const currentIndex = state.currentFieldIndex || 0;
      return Math.round((currentIndex / SINISTRE_FIELDS_ORDER.length) * 100);
    }

    if (state.conversationType?.startsWith('devis_')) {
      const productTypeForProgress =
        state.extractedData?.productType || state.conversationType.replace(/^devis_/, '');
      const needsVehicleType = this.isVehicleProductType(productTypeForProgress);
      const fieldsOrder = needsVehicleType
        ? DEVIS_FIELDS_ORDER
        : DEVIS_FIELDS_ORDER.filter((field) => field !== 'vehicleType');

      const collectedFields = fieldsOrder.filter((field) => state.extractedData?.[field]);
      return Math.round((collectedFields.length / fieldsOrder.length) * 100);
    }

    const totalFields =
      (state.missingInfo?.length || 0) + Object.keys(state.extractedData || {}).length;
    const collectedFields = Object.keys(state.extractedData || {}).length;

    if (totalFields === 0) return 0;
    return Math.round((collectedFields / totalFields) * 100);
  }

  // ============= PUBLIC API METHODS =============

  private threadConfig(threadId: string) {
    return { configurable: { thread_id: threadId }, recursionLimit: 50 };
  }

  /** Forgets a conversation: its state, its token count and its stored images. */
  private async forget(threadId: string): Promise<void> {
    const state = await this.graph.getState(this.threadConfig(threadId)).catch(() => null);
    const images: StoredImage[] = (state?.values?.imageAnalysis ?? [])
      .map((img: any) => img.image)
      .filter(Boolean);
    await this.sessionStore.deleteImages(images);
    await this.checkpointer.deleteThread(threadId);
    await this.sessionStore.clear(threadId);
  }

  totalFieldsOf(result: any): number {
    if (!result.conversationType?.startsWith('devis_')) {
      return SINISTRE_FIELDS_ORDER.length;
    }
    const productType =
      result.extractedData?.productType || (result.conversationType || '').replace(/^devis_/, '');
    return this.isVehicleProductType(productType)
      ? DEVIS_FIELDS_ORDER.length
      : DEVIS_FIELDS_ORDER.length - 1;
  }

  /** What the API returns for a turn. Image entries carry the analysis, never the image. */
  private toTurnResult(sessionId: string, result: any, withImages: boolean) {
    return {
      sessionId,
      response: result.currentResponse,
      language: result.language,
      conversationType: result.conversationType,
      conversationGoal: result.conversationGoal,
      extractedData: result.extractedData,
      missingInformation: result.missingInfo,
      progress: this.calculateProgress(result),
      ...(withImages
        ? {
            imageAnalysis: (result.imageAnalysis ?? []).map(
              ({ image: _image, ...analysis }: any) => analysis,
            ),
          }
        : {}),
      currentFieldIndex: result.currentFieldIndex,
      totalFields: this.totalFieldsOf(result),
      isComplete: result.isComplete,
      needsHumanReview: result.needsHumanReview,
      fraudScore: result.fraudScore,
      validationResults: result.validationResults,
      sinisterId: result.sinisterId || undefined,
      // Devis-specific fields
      recommendedDevis: result.recommendedDevis || [],
      selectedDevisId: result.selectedDevisId || '',
      selectedOrderingNumber: result.selectedOrderingNumber || 0,
      devisDetails: result.devisDetails || null,
      devisStep: result.devisStep || 'collecting',
    };
  }

  private toErrorResult(sessionId: string, error: any, withImages: boolean) {
    return {
      sessionId,
      response: this.getErrorMessage(error),
      language: Language.FRENCH,
      conversationType: 'question',
      conversationGoal: 'Erreur',
      extractedData: {},
      missingInformation: [],
      progress: 0,
      ...(withImages ? { imageAnalysis: [] } : {}),
      currentFieldIndex: 0,
      totalFields: 0,
      isComplete: false,
      needsHumanReview: false,
      fraudScore: 0,
      validationResults: {},
      error: {
        type: error.type || 'UNKNOWN_ERROR',
        message: error.message,
      },
    };
  }

  /**
   * One user message. The conversation is identified by tenant, user and
   * session id together, runs one message at a time, and is counted against
   * the daily limits.
   */
  private async runTurn(sessionId: string, userId: string, message: string, images: ImageData[]) {
    const threadId = this.sessionStore.threadId(userId, sessionId);
    await this.sessionStore.consumeMessageQuota(userId);

    return this.sessionStore.withLock(threadId, () =>
      this.turn.run({ threadId }, async () => {
        try {
          const config = this.threadConfig(threadId);

          // A finished conversation is not continued: the next message starts a
          // new one. Otherwise the completed declaration would be filed again.
          let previous = await this.graph.getState(config).catch(() => null);
          if (previous?.values?.isComplete) {
            await this.forget(threadId);
            previous = null;
          }

          const conversationType: string = previous?.values?.conversationType || 'general';
          const imageAnalysis: any[] = [];
          if (images.length && !conversationType.startsWith('devis_')) {
            const sinistreType = previous?.values?.extractedData?.typeSinistre;
            for (const image of images) {
              const analysis = await this.imageAnalysis.analyze(
                image,
                conversationType,
                sinistreType,
              );
              // Keep the image in object storage; the state only holds the reference.
              const stored = await this.sessionStore.storeImage(threadId, image);
              imageAnalysis.push({ ...analysis, image: stored });
            }
          }

          const result = await this.graph.invoke(
            {
              messages: [new HumanMessage(message)],
              userId,
              ...(imageAnalysis.length ? { imageAnalysis } : {}),
            },
            config,
          );

          return this.toTurnResult(sessionId, result, images.length > 0);
        } catch (error: any) {
          this.logger.error(`Turn failed: ${error?.message}`);
          return this.toErrorResult(sessionId, error, images.length > 0);
        }
      }),
    );
  }

  processMessage(sessionId: string, message: string, userId: string) {
    return this.runTurn(sessionId, userId, message, []);
  }

  processMessageWithImages(
    sessionId: string,
    message: string,
    imageData: ImageData[],
    userId: string,
  ) {
    return this.runTurn(sessionId, userId, message, imageData);
  }

  /** A new, unguessable session id. Clients do not choose their own. */
  newSessionId(): string {
    return this.sessionStore.newSessionId();
  }

  async analyzeImages(imageData: ImageData[], analysisType: string = 'general') {
    try {
      const results: any[] = [];

      for (const image of imageData) {
        const analysis = await this.imageAnalysis.analyze(image, analysisType);
        results.push(analysis);
      }

      return results;
    } catch (error: any) {
      this.logger.error('Analyze images error:', error);

      return imageData.map((image) => ({
        filename: image.filename,
        analysis: 'Image analysis unavailable',
        timestamp: new Date().toISOString(),
        error: error.message,
      }));
    }
  }

  /** The stored state of the caller's own conversation, or null. */
  async getConversationHistory(sessionId: string, userId: string) {
    try {
      const threadId = this.sessionStore.threadId(userId, sessionId);
      const state = await this.graph.getState(this.threadConfig(threadId));
      return state?.values && Object.keys(state.values).length ? state : null;
    } catch (error) {
      this.logger.error('Get conversation history error:', error);
      return null;
    }
  }

  async resetConversation(sessionId: string, userId: string) {
    try {
      await this.forget(this.sessionStore.threadId(userId, sessionId));
      return true;
    } catch (error) {
      this.logger.error('Reset conversation error:', error);
      return false;
    }
  }

  /** The tenant's languages (config.supportedLanguages), or all of them. */
  getSupportedLanguages(): string[] {
    const configured = this.tenantContext.getTenant()?.config?.supportedLanguages;
    if (Array.isArray(configured)) {
      const valid = configured.filter((value) =>
        Object.values(Language).includes(value as Language),
      );
      if (valid.length) {
        return valid;
      }
    }
    return Object.values(Language);
  }

  getRequiredFieldsForSinistre(): string[] {
    return [...SINISTRE_FIELDS_ORDER];
  }

  getRequiredFieldsForDevis(conversationType?: string): string[] {
    const productTypeCandidate = conversationType?.startsWith('devis_')
      ? conversationType.replace(/^devis_/, '')
      : conversationType;

    if (this.isVehicleProductType(productTypeCandidate)) {
      return [...DEVIS_FIELDS_ORDER];
    }

    return DEVIS_FIELDS_ORDER.filter((field) => field !== 'vehicleType');
  }

  getFieldTranslation(field: string, language: Language): string {
    return FIELD_TRANSLATIONS[field]?.[language] || field;
  }

  async getSmartSuggestions(sessionId: string, userId: string): Promise<string[]> {
    try {
      const history = await this.getConversationHistory(sessionId, userId);

      if (!history?.values) {
        return [
          "Bonjour, j'ai besoin d'aide",
          'Je veux déclarer un sinistre',
          "J'ai une question sur mon assurance",
        ];
      }

      const values = history.values;
      const language = values.language || Language.FRENCH;

      if (values.conversationType?.startsWith('sinistre_')) {
        const missingFields = values.missingInfo || [];

        if (missingFields.length > 0) {
          const nextField = missingFields[0];
          const translation = this.getFieldTranslation(nextField, language);

          const suggestions = {
            fr: [
              `Fournir ${translation}`,
              "Je n'ai pas cette information",
              'Puis-je passer cette étape ?',
              "J'ai besoin d'aide",
            ],
            en: [
              `Provide ${translation}`,
              "I don't have this information",
              'Can I skip this step?',
              'I need help',
            ],
            ar: [
              `تقديم ${translation}`,
              'ليس لدي هذه المعلومة',
              'هل يمكنني تخطي هذه الخطوة؟',
              'أحتاج مساعدة',
            ],
          };

          return suggestions[language] || suggestions.fr;
        } else {
          const suggestions = {
            fr: [
              'Finaliser la déclaration',
              'Ajouter des photos',
              'Vérifier les informations',
              "J'ai terminé",
            ],
            en: ['Finalize the declaration', 'Add photos', 'Check information', "I'm done"],
            ar: ['إنهاء التصريح', 'إضافة صور', 'التحقق من المعلومات', 'انتهيت'],
          };

          return suggestions[language] || suggestions.fr;
        }
      }

      const generalSuggestions = {
        fr: [
          'Déclarer un sinistre auto',
          'Déclarer un sinistre habitation',
          'Demander un devis',
          'Question générale',
        ],
        en: ['Declare car claim', 'Declare home claim', 'Request quote', 'General question'],
        ar: ['إعلان مطالبة سيارة', 'إعلان مطالبة منزل', 'طلب عرض سعر', 'سؤال عام'],
      };

      return generalSuggestions[language] || generalSuggestions.fr;
    } catch (error) {
      this.logger.error('Get smart suggestions error:', error);
      return ["Bonjour, j'ai besoin d'aide"];
    }
  }

  getSessionTokenUsage(sessionId: string, userId: string) {
    return this.sessionStore.getUsage(this.sessionStore.threadId(userId, sessionId));
  }

  async visualizeGraph(): Promise<string> {
    const mermaidGraph = `
graph TD
    START([Start]) --> pruneMessages[Prune Messages]
    pruneMessages --> classify[Classify Intent]
    classify --> extract[Extract Information]
    extract --> validatePolicy[Validate Policy]
    validatePolicy --> checkFraud[Check Fraud]
    checkFraud --> decision{Needs Review?}
    decision -->|Yes| flagForReview[Flag for Review]
    decision -->|No| completeCheck{Complete?}
    completeCheck -->|Yes| complete[Complete Conversation]
    completeCheck -->|No| generateResponse[Generate Response]
    generateResponse --> END([End])
    complete --> END
    flagForReview --> END

    classDef startEnd fill:#e1f5fe
    classDef process fill:#f3e5f5
    classDef decision fill:#fff3e0
    classDef review fill:#ffebee

    class START,END startEnd
    class pruneMessages,classify,extract,validatePolicy,checkFraud,generateResponse,complete process
    class decision,completeCheck decision
    class flagForReview review
    `;

    return mermaidGraph.trim();
  }

  // ============= ERROR HANDLING =============

  private getErrorMessage(error: any): string {
    const errorMessage = error.message || error.toString();

    if (errorMessage.includes('quota') || errorMessage.includes('insufficient_quota')) {
      return 'Service temporairement indisponible. Veuillez réessayer plus tard.';
    }

    if (errorMessage.includes('rate_limit') || error.status === 429) {
      return 'Trop de requêtes. Veuillez patienter quelques instants.';
    }

    if (errorMessage.includes('unauthorized') || error.status === 401) {
      return "Erreur d'authentification. Veuillez contacter le support.";
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
      return 'Problème de connexion. Veuillez vérifier votre connexion internet.';
    }

    return "Une erreur s'est produite. Veuillez réessayer.";
  }

  private async saveSinisterToDatabase(state: typeof GraphState.State): Promise<string | null> {
    try {
      if (!state.conversationType.startsWith('sinistre_')) {
        this.logger.log('Conversation is not a sinistre, skipping database save');
        return null;
      }

      if (!state.userId) {
        this.logger.warn('No userId provided, cannot save sinister to database');
        return null;
      }

      // Never file the same declaration twice.
      if (state.sinisterId) {
        return state.sinisterId;
      }

      const data = state.extractedData;

      const formData = {
        typeIncident: data.typeSinistre || 'Unknown',
        dateIncident: data.dateSinistre || new Date().toISOString().split('T')[0],
        timeIncident: data.heureSinistre || undefined,
        location: data.lieuSinistre || 'Unknown',
        description: data.descriptionIncident || '',
        partsEndommagees: this.parsePartiesEndommagees(data.partiesEndommagees),
      };

      const files: UploadedFile[] = [];
      if (state.imageAnalysis && state.imageAnalysis.length > 0) {
        for (const imageData of state.imageAnalysis) {
          const stored: StoredImage | undefined = imageData.image;
          if (stored?.url) {
            // The conversation state only holds a reference; the bytes are in object storage.
            const buffer = await this.sessionStore.loadImage(stored);
            files.push({
              fieldname: 'images',
              originalname: stored.filename || `image-${Date.now()}.jpg`,
              encoding: '7bit',
              mimetype: stored.mimetype || 'image/jpeg',
              buffer,
              size: buffer.length,
            });
          }
        }
      }

      this.logger.log(`Creating sinister in database for user ${state.userId}`);
      this.logger.log(`Files: ${files.length} image(s)`);

      const sinisterResponse = await this.claimsService.declareSinister(
        formData,
        files,
        state.userId,
      );

      this.logger.log(`Sinister created successfully: ${sinisterResponse.numDossier}`);
      // The claim now owns its documents; the conversation copies are no longer needed.
      await this.sessionStore.deleteImages(
        (state.imageAnalysis ?? []).map((img: any) => img.image).filter(Boolean),
      );
      return sinisterResponse.id;
    } catch (error) {
      this.logger.error('Failed to save sinister to database:', error);
      return null;
    }
  }

  private parsePartiesEndommagees(partiesEndommagees: any): string[] {
    if (!partiesEndommagees) {
      this.logger.log('No damaged parts provided');
      return [];
    }

    if (Array.isArray(partiesEndommagees)) {
      this.logger.log(`Damaged parts already array: ${JSON.stringify(partiesEndommagees)}`);
      return partiesEndommagees;
    }

    if (typeof partiesEndommagees === 'string') {
      try {
        const parsed = JSON.parse(partiesEndommagees);
        if (Array.isArray(parsed)) {
          this.logger.log(`Parsed damaged parts from JSON: ${JSON.stringify(parsed)}`);
          return parsed;
        }
      } catch {
        const parts = partiesEndommagees
          .split(/[,;]|\set\s/)
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
        this.logger.log(`Split damaged parts from string: ${JSON.stringify(parts)}`);
        return parts;
      }
    }

    this.logger.warn(`Unexpected damaged parts type: ${typeof partiesEndommagees}`);
    return [];
  }

  private async completeConversation(state: typeof GraphState.State) {
    const hasImages = state.imageAnalysis && state.imageAnalysis.length > 0;

    // Handle devis completion
    if (state.conversationType.startsWith('devis_')) {
      return this.completeDevisConversation(state);
    }

    const sinisterId = await this.saveSinisterToDatabase(state);

    if (!sinisterId) {
      // Say so, keep everything collected, and let the user confirm again to retry.
      const failure = byLanguage(
        state.language,
        {
          fr: "Nous n'avons pas pu enregistrer votre déclaration pour le moment. Vos informations sont conservées : répondez « oui » pour réessayer.",
          en: 'We could not register your claim right now. Your information is kept: reply "yes" to try again.',
        },
        'تعذر تسجيل مطالبتك في الوقت الحالي. معلوماتك محفوظة: أجب بـ «نعم» للمحاولة مرة أخرى.',
      );
      return {
        currentResponse: failure,
        messages: [new AIMessage(failure)],
        isComplete: false,
        awaitingConfirmation: true,
      };
    }

    let sinisterDetails: any = null;
    let savedToDatabase = false;

    if (sinisterId) {
      try {
        const sinister = await this.claimsService.getReclamationStatus(sinisterId, state.userId);
        if (sinister) {
          sinisterDetails = sinister;
          savedToDatabase = true;
          this.logger.log(`Retrieved sinister details from database: ${sinister.numDossier}`);
        }
      } catch (error) {
        this.logger.warn('Could not retrieve sinister details:', error);
      }
    }

    const incidentTime = sinisterDetails?.timeIncident ? ' à ' + sinisterDetails.timeIncident : '';
    const outcome =
      savedToDatabase && sinisterDetails
        ? `SINISTER SUCCESSFULLY SAVED TO DATABASE:
- Numéro de dossier: ${sinisterDetails.numDossier}
- Type: ${sinisterDetails.typeIncident}
- Date: ${sinisterDetails.dateIncident}${incidentTime}
- Lieu: ${sinisterDetails.location}
- Description: ${sinisterDetails.description || 'N/A'}
- Parties endommagées: ${sinisterDetails.partsEndommagees?.join(', ') || 'N/A'}
- Status: ${sinisterDetails.status}
- Documents: ${sinisterDetails.documents?.length || 0} photo(s)
- Créé le: ${sinisterDetails.createdAt}`
        : `Data collected: ${JSON.stringify(state.extractedData)}`;

    const completionPrompt = `Generate a brief, professional confirmation message in ${state.language}.

${outcome}

Needs review: ${state.needsHumanReview}
Fraud score: ${state.fraudScore}

The message should:
1. Say "Voici votre réclamation:" or "Voici votre sinistre:"
2. Present the FULL sinister details (numéro de dossier, type, date, heure, lieu, description, parties endommagées)
3. ${hasImages ? 'Confirm receipt of photos' : ''}
4. ${state.needsHumanReview ? 'Mention that an expert will review' : 'Indicate standard processing'}
5. Be brief and professional

IMPORTANT CLOSING RULES:
- If the language is French, end with exactly "Cordialement," as the final line.
- Do NOT add any company name, signature, footer, or bracketed placeholder after the closing.
- In all languages, avoid adding any company signature lines.

CRITICAL: Show ALL the sinister details in an organized way.

Language: ${state.language}`;

    try {
      const messages = this.aiClient.convertLangChainMessages([new HumanMessage(completionPrompt)]);
      const response = await this.chat(messages, {
        temperature: 0.7,
        maxTokens: 800,
      });

      return {
        currentResponse: response.content,
        messages: [new AIMessage(response.content)],
        isComplete: true,
        sinisterId: sinisterId || '',
      };
    } catch (error) {
      this.failTurnOnProviderError(error);
      this.logger.error('Complete conversation error:', error);

      let fallbackMessage = '';
      if (savedToDatabase && sinisterDetails) {
        fallbackMessage = byLanguage(
          state.language,
          {
            fr: `✅ Voici votre sinistre enregistré:

📋 Numéro de dossier: ${sinisterDetails.numDossier}
📌 Type: ${sinisterDetails.typeIncident}
📅 Date: ${sinisterDetails.dateIncident}${sinisterDetails.timeIncident ? ' à ' + sinisterDetails.timeIncident : ''}
📍 Lieu: ${sinisterDetails.location}
📝 Description: ${sinisterDetails.description || 'N/A'}
🔧 Parties endommagées: ${sinisterDetails.partsEndommagees?.join(', ') || 'N/A'}
📸 Photos: ${sinisterDetails.documents?.length || 0} document(s)

Votre réclamation est en cours de traitement.`,
            en: `✅ Here is your registered claim:

📋 File number: ${sinisterDetails.numDossier}
📌 Type: ${sinisterDetails.typeIncident}
📅 Date: ${sinisterDetails.dateIncident}${sinisterDetails.timeIncident ? ' at ' + sinisterDetails.timeIncident : ''}
📍 Location: ${sinisterDetails.location}
📝 Description: ${sinisterDetails.description || 'N/A'}
🔧 Damaged parts: ${sinisterDetails.partsEndommagees?.join(', ') || 'N/A'}
📸 Photos: ${sinisterDetails.documents?.length || 0} document(s)

Your claim is being processed.`,
          },
          `✅ إليك مطالبتك المسجلة:

📋 رقم الملف: ${sinisterDetails.numDossier}
📌 النوع: ${sinisterDetails.typeIncident}
📅 التاريخ: ${sinisterDetails.dateIncident}${sinisterDetails.timeIncident ? ' في ' + sinisterDetails.timeIncident : ''}
📍 المكان: ${sinisterDetails.location}
📝 الوصف: ${sinisterDetails.description || 'غير متاح'}
🔧 الأجزاء المتضررة: ${sinisterDetails.partsEndommagees?.join(', ') || 'غير متاح'}
📸 الصور: ${sinisterDetails.documents?.length || 0} مستند(ات)

مطالبتك قيد المعالجة.`,
        );
      } else {
        fallbackMessage = byLanguage(
          state.language,
          {
            fr: `Votre déclaration a été enregistrée. Un problème technique empêche l'affichage complet.`,
            en: `Your claim has been registered. A technical issue prevents full display.`,
          },
          `تم تسجيل مطالبتك. مشكلة تقنية تمنع العرض الكامل.`,
        );
      }

      return {
        currentResponse: fallbackMessage,
        messages: [new AIMessage(fallbackMessage)],
        isComplete: true,
        sinisterId: sinisterId || '',
      };
    }
  }

  private async completeDevisConversation(state: typeof GraphState.State) {
    try {
      // Generate quotes if not already done
      if (state.missingInfo.length === 0 && state.recommendedDevis.length === 0) {
        const quotes = await this.generateDevisQuotes(state);
        if (quotes && quotes.length > 0) {
          const quotesWithOrdering = this.addOrderingNumbersToDevis(quotes);
          return {
            currentResponse: this.formatDevisOptions(quotesWithOrdering, state.language),
            messages: [new AIMessage(this.formatDevisOptions(quotesWithOrdering, state.language))],
            isComplete: false,
            recommendedDevis: quotesWithOrdering,
            devisStep: 'showing_options',
          };
        }
      }

      // Show selected devis details
      if (state.selectedDevisId && state.devisStep === 'showing_details') {
        const devisDetails = await this.getDevisDetails(state.selectedDevisId, state.language);
        if (devisDetails) {
          return {
            currentResponse: this.formatDevisDetails(devisDetails, state.language),
            messages: [new AIMessage(this.formatDevisDetails(devisDetails, state.language))],
            isComplete: false,
            devisDetails: devisDetails,
          };
        }
      }

      // Fallback completion message
      const completionMessage = byLanguage(
        state.language,
        {
          fr: 'Merci pour vos informations. Nous avons généré des devis personnalisés pour vous.',
          en: 'Thank you for your information. We have generated personalized quotes for you.',
        },
        'شكراً لمعلوماتك. لقد قمنا بتوليد عروض أسعار مخصصة لك.',
      );

      return {
        currentResponse: completionMessage,
        messages: [new AIMessage(completionMessage)],
        isComplete: true,
      };
    } catch (error) {
      this.logger.error('Complete devis conversation error:', error);

      const errorMessage = byLanguage(
        state.language,
        {
          fr: "Une erreur s'est produite lors de la génération des devis. Veuillez réessayer.",
          en: 'An error occurred while generating quotes. Please try again.',
        },
        'حدث خطأ أثناء توليد العروض. يرجى المحاولة مرة أخرى.',
      );

      return {
        currentResponse: errorMessage,
        messages: [new AIMessage(errorMessage)],
        isComplete: true,
      };
    }
  }

  private async generateDevisQuotes(state: typeof GraphState.State): Promise<any[]> {
    try {
      const data = state.extractedData;

      // Map conversation type to product type
      const productTypeMap: Record<string, string> = {
        devis_auto: 'auto',
        devis_habitation: 'habitation',
        devis_scolaire: 'scolaire',
        devis_bateau: 'bateau',
        devis_catnat: 'catnat',
        devis_mrp: 'mrp',
        devis_sante: 'sante',
      };

      const conversationProductType = productTypeMap[state.conversationType] || '';
      const fromConversationType = state.conversationType?.startsWith('devis_')
        ? state.conversationType.replace(/^devis_/, '')
        : '';
      const inferredProductType = conversationProductType || fromConversationType;

      const productTypeInput =
        data.productType || inferredProductType || conversationProductType || 'auto';
      const { canonical, slug } = this.resolveProductType(productTypeInput);
      const normalizedProductType = canonical || slug || 'auto';
      const vehicleTypeNeeded = this.isVehicleProductType(normalizedProductType);

      const filters: GetQuotes = {
        productType: normalizedProductType as any,
        age: Number.parseInt(data.age),
        codePostal: data.codePostal,
        budget: Number.parseFloat(data.budget),
      };

      if (vehicleTypeNeeded) {
        filters.vehicleType = data.vehicleType || undefined;
      }

      this.logger.log(`Generating devis quotes with filters: ${JSON.stringify(filters)}`);

      const quotes = await this.devisService.getRecommmendedDevis(filters, state.language as any);

      this.logger.log(`Generated ${quotes.length} devis quotes`);
      return quotes;
    } catch (error) {
      this.logger.error('Error generating devis quotes:', error);
      return [];
    }
  }

  private async getDevisDetails(devisId: string, language: Language): Promise<any> {
    try {
      const details = await this.devisService.getDetailsDevis(devisId, language as any);
      this.logger.log(`Retrieved devis details for ${devisId}`);
      return details;
    } catch (error) {
      this.logger.error('Error getting devis details:', error);
      return null;
    }
  }

  private formatDevisOptions(quotes: any[], language: Language): string {
    if (quotes.length === 0) {
      return byLanguage(
        language,
        {
          fr: 'Aucun devis trouvé pour vos critères.',
          en: 'No quotes found for your criteria.',
        },
        'لم يتم العثور على عروض أسعار لمعاييرك.',
      );
    }

    let message = '';

    if (language === Language.FRENCH) {
      message = "📋 **Voici nos meilleures offres d'assurance :**\n\n";
      quotes.forEach((quote, index) => {
        message += `${index + 1}. **${quote.titleFr}**\n`;
        message += `   💰 Prix mensuel: ${quote.priceMonthly} ${this.quoteRules().currency}\n`;
        message += `   📋 Type: ${quote.planTypeFr}\n`;
        message += `   🛡️ Franchise: ${quote.deductible} ${this.quoteRules().currency}\n\n`;
      });
      message += 'Répondez avec le numéro de votre choix pour voir les détails.';
    } else if (language === Language.ENGLISH) {
      message = '📋 **Here are our best insurance offers:**\n\n';
      quotes.forEach((quote, index) => {
        message += `${index + 1}. **${quote.titleEn}**\n`;
        message += `   💰 Monthly price: ${quote.priceMonthly} ${this.quoteRules().currency}\n`;
        message += `   📋 Type: ${quote.planTypeEn}\n`;
        message += `   🛡️ Deductible: ${quote.deductible} ${this.quoteRules().currency}\n\n`;
      });
      message += 'Reply with the number of your choice to see details.';
    } else {
      message = '📋 **إليك أفضل عروض التأمين لدينا:**\n\n';
      quotes.forEach((quote, index) => {
        message += `${index + 1}. **${quote.titleAr}**\n`;
        message += `   💰 السعر الشهري: ${quote.priceMonthly} ${this.quoteRules().currency}\n`;
        message += `   📋 النوع: ${quote.planTypeAr}\n`;
        message += `   🛡️ الخصم: ${quote.deductible} ${this.quoteRules().currency}\n\n`;
      });
      message += 'رد برقم اختيارك لرؤية التفاصيل.';
    }

    return message;
  }

  private addOrderingNumbersToDevis(quotes: any[]): any[] {
    return quotes.map((quote, index) => ({
      ...quote,
      orderingNumber: index + 1, // Add 1-based ordering number
    }));
  }

  private formatRecommendedDevisResponse(quotes: any[], language: Language): string {
    const selectTitle = (quote: any) => {
      if (!quote) return '';

      if (language === Language.FRENCH) {
        return quote.titleFr || quote.title || quote.name || 'Offre assurance';
      }

      if (language === Language.ARABIC) {
        return quote.titleAr || quote.titleFr || quote.title || quote.name || 'عرض التأمين';
      }

      return quote.titleEn || quote.titleFr || quote.title || quote.name || 'Insurance offer';
    };

    const simplifiedQuotes = (quotes || []).map((quote: any, index: number) => ({
      num: quote.orderingNumber || index + 1,
      id: quote.id,
      title: selectTitle(quote),
      priceMonthly: quote.priceMonthly,
      deductible: quote.deductible,
      termMonths: quote.termMonths,
    }));

    const responsePayload = {
      total: simplifiedQuotes.length,
      data: simplifiedQuotes,
    };

    return JSON.stringify(responsePayload, null, 2);
  }

  private formatDevisDetails(devis: any, language: Language): string {
    let message = '';

    if (language === Language.FRENCH) {
      message = `📋 **Détails de l'offre: ${devis.title}**\n\n`;
      message += `💰 **Prix mensuel:** ${devis.priceMonthly} ${this.quoteRules().currency}\n`;
      message += `🛡️ **Franchise:** ${devis.deductible} ${this.quoteRules().currency}\n`;
      message += `📅 **Durée:** ${devis.termMonths} mois\n`;
      message += `📋 **Type de plan:** ${devis.planType}\n\n`;
      message += `📝 **Conditions de démarrage:**\n${devis.startCondition}\n\n`;

      if (devis.coverageDetails && devis.coverageDetails.length > 0) {
        message += `🛡️ **Couvertures incluses:**\n`;
        devis.coverageDetails.forEach((coverage: any) => {
          message += `• ${coverage.label}${coverage.included ? ' ✅' : ' ❌'}\n`;
        });
      }

      message += "\n💬 Voulez-vous souscrire à cette offre ou voir d'autres options?";
    } else if (language === Language.ENGLISH) {
      message = `📋 **Offer details: ${devis.title}**\n\n`;
      message += `💰 **Monthly price:** ${devis.priceMonthly} ${this.quoteRules().currency}\n`;
      message += `🛡️ **Deductible:** ${devis.deductible} ${this.quoteRules().currency}\n`;
      message += `📅 **Term:** ${devis.termMonths} months\n`;
      message += `📋 **Plan type:** ${devis.planType}\n\n`;
      message += `📝 **Start conditions:**\n${devis.startCondition}\n\n`;

      if (devis.coverageDetails && devis.coverageDetails.length > 0) {
        message += `🛡️ **Included coverages:**\n`;
        devis.coverageDetails.forEach((coverage: any) => {
          message += `• ${coverage.label}${coverage.included ? ' ✅' : ' ❌'}\n`;
        });
      }

      message += '\n💬';
    }
    return message;
  }
}
