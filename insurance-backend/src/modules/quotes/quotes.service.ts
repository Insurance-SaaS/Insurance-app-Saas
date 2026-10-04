import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { AppLogger } from 'src/shared/logger/app-logger.service';
import { Quote } from './entities/quote.entity';
import { ConfigService } from '@nestjs/config';
import { Product } from './entities/product.entity';
import { SupportedLanguage } from 'src/shared/utils/multilingual.util';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { ICacheService } from 'src/contracts/interfaces/i-cache.service';
import { CACHE_SERVICE } from 'src/contracts/tokens';
import { IQuotesService } from 'src/contracts/interfaces/i-quotes.service';

export interface GetQuotes {
  productType: string;
  age: number;
  codePostal: string;
  budget: number;
  vehicleType?: string;
}

@Injectable()
export class QuotesService implements IQuotesService {
  private readonly logger = new Logger(QuotesService.name);
  private readonly cacheNamespace = 'quotes';

  private async tryGetCachedById(id: string): Promise<any> {
    return this.cacheService.get(this.cacheNamespace, `id:${id}`);
  }

  private async tryGetCachedByFilters(filters: GetQuotes): Promise<any> {
    const filterKey = Buffer.from(JSON.stringify(filters)).toString('base64');
    return this.cacheService.get(this.cacheNamespace, `filters:${filterKey}`);
  }

  private async tryGetCachedAll(): Promise<any> {
    return this.cacheService.get(this.cacheNamespace, 'all');
  }

  private async tryGetCachedByProduct(productType: string): Promise<any> {
    return this.cacheService.get(this.cacheNamespace, `product:${productType}`);
  }

  private async cacheDevis(cacheKey: string, data: any): Promise<void> {
    await this.cacheService.set(this.cacheNamespace, cacheKey, data);
  }

  private async invalidateDevisCache(): Promise<void> {
    await this.cacheService.invalidateAll(this.cacheNamespace);
  }

  private computeScore(devis: Quote, filters: GetQuotes): number {
    const { age, budget, codePostal } = filters;

    // 1. Budget score — closer monthly price to budget = higher
    const priceDiff = Math.abs(Number(devis.priceMonthly) - budget);
    const budgetScore = Math.max(0, 100 - priceDiff);

    // 2. Age score — simple rules based on deductible & planType
    const youngOnPremium = age < 25 && devis.getPlanType('en').toLowerCase().includes('premium');
    const seniorWithLowDeductible = age > 60 && Number(devis.deductible) < 500;
    const ageScore = youngOnPremium || seniorWithLowDeductible ? 100 : 50;

    // 3. Postal score — placeholder (no postal field in entity yet)
    // Could later depend on product or devis rules
    const postalScore = codePostal.startsWith('1') ? 70 : 100;

    // Weighted sum
    return budgetScore * 0.5 + ageScore * 0.3 + postalScore * 0.2;
  }

  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
    @Inject(CACHE_SERVICE)
    private readonly cacheService: ICacheService,
    private readonly configService: ConfigService,
    private readonly appLogger: AppLogger,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get devisRepository() {
    return this.tenantRepositoryFactory.getRepository(Quote);
  }

  private get productRepository() {
    return this.tenantRepositoryFactory.getRepository(Product);
  }

  async getRecommmendedDevis(filters: GetQuotes, language: SupportedLanguage = 'en') {
    const { productType } = filters;

    this.logger.log(`🔍 Searching for devis with productType: "${productType}"`);

    // ✅ FIX: Use flexible matching for product type
    // Map common aliases to proper product types
    const productTypeAliases: Record<string, string[]> = {
      auto: ['auto', 'automobile', 'car', 'vehicle', 'voiture', 'véhicule'],
      habitation: ['habitation', 'home', 'house', 'maison', 'logement'],
      scolaire: ['scolaire', 'school', 'étudiant', 'student'],
      bateau: ['bateau', 'boat', 'marine'],
      catnat: ['catnat', 'catastrophe', 'disaster'],
      mrp: ['mrp', 'professionnelle', 'professional', 'business'],
      sante: ['sante', 'santé', 'health', 'medical'],
    };

    // Find matching aliases
    let searchTerms = [productType];
    for (const aliases of Object.values(productTypeAliases)) {
      if (aliases.some((alias) => productType.toLowerCase().includes(alias.toLowerCase()))) {
        searchTerms = aliases;
        this.logger.log(`✅ Expanded "${productType}" to search terms: ${searchTerms.join(', ')}`);
        break;
      }
    }

    // The product catalogue is small: match it in memory (same on every engine,
    // and no wildcard characters from user input reach the database), then load
    // the quotes of the matching products.
    const terms = searchTerms.map((term) => term.toLowerCase());
    const matchingProductIds = (await this.productRepository.find())
      .filter((product) =>
        [product.typeEn, product.typeFr, product.typeAr].some((type) =>
          terms.some((term) => (type ?? '').toLowerCase().includes(term)),
        ),
      )
      .map((product) => product.id);

    const devisList = matchingProductIds.length
      ? await this.devisRepository
          .createQueryBuilder('devis')
          .leftJoinAndSelect('devis.product', 'product')
          .where('product.id IN (:...productIds)', { productIds: matchingProductIds })
          .getMany()
      : [];

    this.logger.log(`📊 Found ${devisList.length} devis for productType "${productType}"`);

    if (devisList.length === 0) {
      this.logger.warn(`⚠️ No devis found. Debug info:`);
      this.logger.warn(`  - Search terms: ${searchTerms.join(', ')}`);
      this.logger.warn(`  - Filters: ${JSON.stringify(filters)}`);

      // Debug: Show what products exist
      const allProducts = await this.productRepository.find();
      this.logger.warn(`  - Available products in DB (${allProducts.length}):`);
      allProducts.forEach((p) => {
        this.logger.warn(`    - ${p.typeEn} / ${p.typeFr} / ${p.typeAr}`);
      });
    }

    const filtered = devisList
      .map((devis) => ({
        id: devis.id,
        // ✅ FIX: Return ALL language fields, not just one
        title: devis.getTitle(language), // Current language (for backward compatibility)
        titleFr: devis.titleFr || devis.getTitle('fr'),
        titleEn: devis.titleEn || devis.getTitle('en'),
        titleAr: devis.titleAr || devis.getTitle('ar'),
        priceMonthly: devis.priceMonthly,
        deductible: devis.deductible,
        termMonths: devis.termMonths,
        // ✅ Also return all plan type translations
        planType: devis.getPlanType(language), // Current language
        planTypeFr: devis.planTypeFr || devis.getPlanType('fr'),
        planTypeEn: devis.planTypeEn || devis.getPlanType('en'),
        planTypeAr: devis.planTypeAr || devis.getPlanType('ar'),
        score: this.computeScore(devis, filters),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ score, ...summary }) => summary);

    this.logger.log(`✅ Returning ${filtered.length} filtered & scored devis`);

    // Cache the result
    const filterKey = Buffer.from(JSON.stringify(filters)).toString('base64');
    await this.cacheDevis(`filters:${filterKey}:${language}`, filtered);

    return filtered;
  }
  async getDetailsDevis(id: string, language: SupportedLanguage = 'en') {
    const devis = await this.devisRepository.findOne({
      where: { id },
      relations: ['product', 'coverageDetails', 'payments', 'summaryTerms'],
    });

    if (!devis) {
      throw new NotFoundException(`Devis with id ${id} not found`);
    }

    // Localize the response
    const localizedDevis = this.localizeDevisResponse(devis, language);

    // Convert to plain data, exactly as it will be sent: entity instances become
    // plain objects and dates become strings. structuredClone would keep both,
    // and removeEmpty() below would then walk into Date objects.
    const plainDevis = JSON.parse(JSON.stringify(localizedDevis)); // NOSONAR

    // If it's "Assurance automobile", remove summaryTerms dynamically

    // Recursively clean null and undefined fields
    const cleanedDevis = this.removeEmpty(plainDevis);

    // 🧩 Reorder fields to make "product" appear first
    const { product, ...rest } = cleanedDevis;
    const orderedDevis = product ? { product, ...rest } : rest;

    // Cache the ordered version (include language in cache key)
    await this.cacheDevis(`id:${id}:${language}`, orderedDevis);

    return orderedDevis;
  }

  /**
   * Localize a devis entity with all its relations
   */
  private localizeDevisResponse(devis: Quote, language: SupportedLanguage): any {
    return {
      id: devis.id,
      title: devis.getTitle(language),
      priceMonthly: devis.priceMonthly,
      deductible: devis.deductible,
      termMonths: devis.termMonths,
      planType: devis.getPlanType(language),
      startCondition: devis.getStartCondition(language),
      product: devis.product
        ? {
            id: devis.product.id,
            type: devis.product.getType(language),
          }
        : null,
      coverageDetails: devis.coverageDetails
        ? devis.coverageDetails.map((cd) => ({
            id: cd.id,
            label: cd.getLabel(language),
            included: cd.included,
          }))
        : [],
      payments: devis.payments
        ? devis.payments.map((p) => ({
            id: p.id,
            type: p.getType(language),
            amount: p.amount,
            mode: p.getMode(language),
          }))
        : [],
      summaryTerms: devis.summaryTerms
        ? {
            id: devis.summaryTerms.id,
            contractValidity: devis.summaryTerms.getContractValidity(language),
            cancelPolicy: devis.summaryTerms.getCancelPolicy(language),
            claimsProcessing: devis.summaryTerms.getClaimsProcessing(language),
            docsStorage: devis.summaryTerms.getDocsStorage(language),
          }
        : null,
      createdAt: devis.createdAt,
      updatedAt: devis.updatedAt,
    };
  }

  // async getDetailsDevis(id: string) {
  //   const devis = await this.devisRepository.findOne({
  //     where: { id },
  //     relations: ['product', 'coverageDetails', 'payments', 'summaryTerms'],
  //   });

  //   if (!devis) {
  //     throw new NotFoundException(`Devis with id ${id} not found`);
  //   }

  //   // Convert to plain object to remove TypeORM proxies & circular refs
  //   const plainDevis = JSON.parse(JSON.stringify(devis));

  //   // If it's "Assurance automobile", remove summaryTerms dynamically
  //   if (plainDevis.product?.type === 'Assurance automobile') {
  //     delete plainDevis.summaryTerms;
  //   }

  //   // Recursively clean null and undefined fields
  //   const cleanedDevis = this.removeEmpty(plainDevis);

  //   // Optionally cache the cleaned version
  //   await this.cacheDevis(this.buildCacheKeyById(id), cleanedDevis);

  //   return cleanedDevis;
  // }

  // Utility to recursively clean empty fields (null / undefined / empty objects)
  private removeEmpty(obj: any): any {
    if (Array.isArray(obj)) {
      return obj
        .map((v) => this.removeEmpty(v))
        .filter((v) => v !== null && v !== undefined && Object.keys(v).length > 0);
    } else if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj)
          .filter(([_, v]) => v !== null && v !== undefined)
          .map(([k, v]) => [k, this.removeEmpty(v)]),
      );
    }
    return obj;
  }

  async compareDevis(devisAId: string, devisBId: string, language: SupportedLanguage = 'en') {
    this.appLogger.log('Comparing devis', 'DevisService');

    const devisA = await this.devisRepository.findOne({
      where: { id: devisAId },
      relations: ['coverageDetails', 'summaryTerms'],
    });

    const devisB = await this.devisRepository.findOne({
      where: { id: devisBId },
      relations: ['coverageDetails', 'summaryTerms'],
    });

    if (!devisA || !devisB) {
      this.appLogger.warn('Devis not found', 'DevisService');
      throw new NotFoundException('One or both devis not found');
    }

    // Debug logging for coverage details
    this.appLogger.debug('Coverage details fetched', 'DevisService');

    const planA = {
      id: devisA.id,
      title: devisA.getTitle(language),
      priceMonthly: Number(devisA.priceMonthly),
      deductible: Number(devisA.deductible),
      thirdPartyCoverage:
        devisA.coverageDetails?.length > 0
          ? devisA.coverageDetails.map((c) => c.getLabel(language)).join(', ')
          : 'N/A',
      coverage:
        devisA.coverageDetails?.length > 0
          ? devisA.coverageDetails.map((c) => c.getLabel(language)).join(', ')
          : '',
    };

    const planB = {
      id: devisB.id,
      title: devisB.getTitle(language),
      priceMonthly: Number(devisB.priceMonthly),
      deductible: Number(devisB.deductible),
      thirdPartyCoverage:
        devisB.coverageDetails?.length > 0
          ? devisB.coverageDetails.map((c) => c.getLabel(language)).join(', ')
          : 'N/A',
      coverage:
        devisB.coverageDetails?.length > 0
          ? devisB.coverageDetails.map((c) => c.getLabel(language)).join(', ')
          : '',
    };

    const result = { planA, planB };

    // Debug: Log the final result
    this.appLogger.debug('Final comparison computed', 'DevisService');

    return result;
  }
  // src/modules/quotes/quotes.service.ts
  // src/modules/quotes/quotes.service.ts
  async getAllDevis(): Promise<Quote[]> {
    // Try cache first
    // const cached = await this.tryGetCachedAll();
    // if (cached) {
    //   return cached;
    // }

    const devisList = await this.devisRepository.find({
      select: ['id', 'titleEn', 'titleFr', 'titleAr'], // multilingual fields
      order: { createdAt: 'DESC' },
    });

    // Cache the result
    await this.cacheDevis('all', devisList);

    return devisList;
  }

  async getAllDevisByProductType(productType: string): Promise<Quote[]> {
    // Decode URL-encoded productType (e.g., "Assurance%20automobile" -> "Assurance automobile")
    const decodedProductType = decodeURIComponent(productType || '').trim();

    if (!decodedProductType) {
      this.logger.warn('Empty product type provided, returning empty array', 'DevisService');
      return [];
    }

    this.logger.log(`🔍 Searching devis for product type: "${decodedProductType}"`, 'DevisService');

    // ✅ FIX: Use flexible matching for product type (same approach as getRecommmendedDevis)
    // Map common aliases to proper product types
    const productTypeAliases: Record<string, string[]> = {
      auto: ['auto', 'automobile', 'car', 'vehicle', 'voiture', 'véhicule', 'assurance automobile'],
      habitation: ['habitation', 'home', 'house', 'maison', 'logement'],
      scolaire: ['scolaire', 'school', 'étudiant', 'student'],
      bateau: ['bateau', 'boat', 'marine'],
      catnat: ['catnat', 'catastrophe', 'disaster'],
      mrp: ['mrp', 'professionnelle', 'professional', 'business'],
      sante: ['sante', 'santé', 'health', 'medical'],
    };

    // Find matching aliases
    let searchTerms = [decodedProductType];
    for (const [canonical, aliases] of Object.entries(productTypeAliases)) {
      const lowerInput = decodedProductType.toLowerCase();
      if (
        aliases.some((alias) => lowerInput.includes(alias.toLowerCase())) ||
        canonical === lowerInput
      ) {
        searchTerms = [...new Set([...searchTerms, ...aliases])];
        this.logger.log(
          `✅ Expanded "${decodedProductType}" to search terms: ${searchTerms.slice(0, 5).join(', ')}...`,
          'DevisService',
        );
        break;
      }
    }

    // ✅ Use repository.find() approach - fetch all devis with products and filter in memory
    // This completely avoids QueryBuilder column mapping issues with Oracle
    // Product relation is eager, so all devis will have products loaded

    const allDevis = await this.devisRepository.find({
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });

    // Filter devis where product matches any search term in any language field
    const matchingDevis = allDevis.filter((devis) => {
      if (!devis.product) return false;

      const productTexts = [
        devis.product.typeEn?.toLowerCase() || '',
        devis.product.typeFr?.toLowerCase() || '',
        devis.product.typeAr?.toLowerCase() || '',
      ];

      return searchTerms.some((term) => {
        const lowerTerm = term.toLowerCase();
        return productTexts.some((text) => text.includes(lowerTerm));
      });
    });

    this.logger.log(
      `📊 Found ${matchingDevis.length} devis for product type: "${decodedProductType}" (filtered from ${allDevis.length} total devis)`,
      'DevisService',
    );

    // Use matchingDevis directly instead of queryBuilder
    const devisList = matchingDevis;

    // Log debug info if no results found
    if (devisList.length === 0) {
      const devisWithProducts = allDevis.filter((d) => d.product).length;
      this.logger.warn(
        `⚠️ No devis found for "${decodedProductType}". ` +
          `Search terms: ${searchTerms.slice(0, 3).join(', ')}... | ` +
          `Devis with products: ${devisWithProducts}/${allDevis.length}`,
        'DevisService',
      );
    }

    return devisList;
  }
  async getAllProducts(): Promise<Product[]> {
    return this.productRepository.find();
  }
  async findById(id: string): Promise<Quote> {
    // const cached = await this.tryGetCachedById(id);
    // if (cached) {
    //   return cached;
    // }
    const devis = await this.devisRepository.findOne({ where: { id }, relations: ['product'] });
    if (!devis) {
      throw new NotFoundException('Devis not found');
    }
    await this.cacheDevis(`id:${id}`, devis);
    return devis;
  }

  /* ──────────────── Admin CRUD ──────────────── */

  async createQuote(data: Partial<Quote>): Promise<Quote> {
    const { productId, ...rest } = data as any;
    const product = productId
      ? await this.productRepository.findOne({ where: { id: productId } })
      : null;
    if (productId && !product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }
    const quote = this.devisRepository.create({ ...rest, product } as Partial<Quote>);
    const saved = await this.devisRepository.save(quote as Quote);
    await this.invalidateDevisCache();
    return saved;
  }

  async updateQuote(id: string, data: Partial<Quote>): Promise<Quote> {
    const existing = await this.findById(id);
    const { productId, ...rest } = data as any;
    if (productId) {
      const product = await this.productRepository.findOne({ where: { id: productId } });
      if (!product) {
        throw new NotFoundException(`Product with id ${productId} not found`);
      }
      (existing as any).product = product;
    }
    Object.assign(existing, rest);
    const saved = await this.devisRepository.save(existing);
    await this.invalidateDevisCache();
    return saved;
  }

  async deleteQuote(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.devisRepository.remove(existing);
    await this.invalidateDevisCache();
  }
}
