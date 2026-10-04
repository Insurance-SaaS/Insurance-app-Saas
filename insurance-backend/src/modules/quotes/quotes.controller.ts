import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseInterceptors,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiParam,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import {
  ErrorResponseDto,
  NotFoundErrorResponseDto,
  InternalServerErrorResponseDto,
} from 'src/shared/dtos/error-response.dto';
import { QuotesService } from './quotes.service';
import { AppLogger } from 'src/shared/logger/app-logger.service';
import { GetQuotesDto } from './dtos/get-quotes.dto';
import { RecommendedQuoteResponseDto } from './dtos/recommended-quotes-response.dto';
import { RecommendedQuoteDto } from './dtos/recommended-quotes.dto';
import { QuoteDto } from './dtos/quote.dto';
import { CompareQuotesDto } from './dtos/compare-contrat-request.dto';
import { CompareQuotesResponseDto } from './dtos/compare-contrat-response.dto';
import { QuoteListDto } from './dtos/quote-list.dto';
import { Quote } from './entities/quote.entity';
import { ProductDto } from './dtos/product.dto';
import { CreateQuoteDto } from './dtos/create-quote.dto';
import { UpdateQuoteDto } from './dtos/update-quote.dto';
import {
  LanguageInterceptor,
  RequestWithLanguage,
} from 'src/shared/interceptors/language.interceptor';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/modules/users/entities/user.entity';
@ApiTags('Quotes')
@UseInterceptors(LanguageInterceptor)
@RequiresPlugin('@insurance/quotes')
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly devisService: QuotesService,
    private readonly logger: AppLogger,
  ) {}

  // POST routes first
  @Post('compare')
  @ApiOperation({ summary: 'Compare two devis (insurance plans)' })
  @ApiResponse({ status: 200, type: CompareQuotesResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'One or both devis not found',
    type: NotFoundErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async compareDevis(
    @Body() body: CompareQuotesDto,
    @Req() req: RequestWithLanguage,
  ): Promise<CompareQuotesResponseDto> {
    try {
      const language = req.language || 'en';
      return await this.devisService.compareDevis(body.devisAId, body.devisBId, language);
    } catch (error) {
      this.logger.error('Error comparing devis:', error.message);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to compare devis: ${error.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Specific GET routes (must come before generic :id route)
  @Get('recommended')
  @ApiOperation({ summary: 'Get recommended insurance quotes based on filters' })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['en', 'fr', 'ar'],
    description: 'Preferred language for response',
  })
  @ApiOkResponse({
    type: RecommendedQuoteResponseDto,
    description: 'Get recommended devis based on filters',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getRecommendedDevis(
    @Query() filters: GetQuotesDto,
    @Req() req: RequestWithLanguage,
  ): Promise<RecommendedQuoteResponseDto> {
    try {
      this.logger.log('recommended devis request', 'DevisController');
      const language = req.language || 'en';
      const devis = await this.devisService.getRecommmendedDevis(filters, language);

      return {
        total: devis.length,
        data: devis.map(
          (d) =>
            ({
              id: d.id,
              title: d.title,
              priceMonthly: d.priceMonthly,
              deductible: d.deductible,
              termMonths: d.termMonths,
            }) as RecommendedQuoteDto,
        ),
      };
    } catch (error) {
      this.logger.error('Error getting recommended devis:', error.message);
      throw new InternalServerErrorException(
        `Failed to get recommended devis: ${error.message || 'Unknown error occurred'}`,
      );
    }
  }

  @Get('products')
  @ApiOperation({ summary: 'Get all available insurance product types' })
  @ApiOkResponse({ type: [ProductDto] })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['en', 'fr', 'ar'],
    description: 'Preferred language for response',
  })
  async getAllProducts(@Req() req: RequestWithLanguage): Promise<ProductDto[]> {
    const language = req.language || 'en';
    const products = await this.devisService.getAllProducts();
    return products.map((p) => new ProductDto(p, language));
  }

  // Convenience variant: allow query param usage. 'devisByProduct' is the former name, kept for the mobile app.
  @Get(['by-product', 'devisByProduct'])
  @ApiOperation({
    summary: 'Get all insurance quotes for a specific product type (by query param)',
  })
  @ApiQuery({ name: 'productType', type: String, required: true })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['en', 'fr', 'ar'],
    description: 'Preferred language for response',
  })
  @ApiOkResponse({ type: [QuoteListDto] })
  async getAllDevisByProductQuery(
    @Query('productType') productType: string,
    @Req() req: RequestWithLanguage,
  ): Promise<QuoteListDto[]> {
    return this.quotesOfProductType(productType, req);
  }

  private async quotesOfProductType(
    productType: string,
    req: RequestWithLanguage,
  ): Promise<QuoteListDto[]> {
    const devis = await this.devisService.getAllDevisByProductType(productType);
    return devis.map((d) => new QuoteListDto(d, req.language || 'en'));
  }

  @Get(['by-product/:productType', 'devisByProduct/:productType'])
  @ApiOperation({ summary: 'Get all insurance quotes for a specific product type (by path param)' })
  @ApiParam({ name: 'productType', type: String })
  @ApiOkResponse({ type: [QuoteListDto] })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['en', 'fr', 'ar'],
    description: 'Preferred language for response',
  })
  async getAllDevisByProduct(
    @Param('productType') productType: string,
    @Req() req: RequestWithLanguage,
  ): Promise<QuoteListDto[]> {
    return this.quotesOfProductType(productType, req);
  }

  // Generic routes come last
  @Get(':id')
  @ApiOperation({ summary: 'Get detailed information about a specific insurance quote' })
  @ApiParam({ name: 'id', type: String, description: 'ID of the devis' })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['en', 'fr', 'ar'],
    description: 'Preferred language for response',
  })
  @ApiOkResponse({
    type: QuoteDto,
    description: 'Get detailed information about a specific devis',
  })
  @ApiResponse({
    status: 404,
    description: 'Devis not found',
    type: NotFoundErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getDetails(@Param('id') id: string, @Req() req: RequestWithLanguage): Promise<any> {
    try {
      const language = req.language || 'en';
      const devis = await this.devisService.getDetailsDevis(id, language);

      if (!devis) {
        throw new NotFoundException(`Devis with id ${id} not found`);
      }

      // Return the entire cleaned devis object directly
      return devis;
    } catch (error) {
      this.logger.error(`Error getting devis details for ${id}:`, error.message);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to get devis details: ${error.message || 'Unknown error occurred'}`,
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all available insurance quotes' })
  @ApiOkResponse({ type: [QuoteListDto] })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['en', 'fr', 'ar'],
    description: 'Preferred language for response',
  })
  async getAllDevis(@Req() req: RequestWithLanguage): Promise<QuoteListDto[]> {
    this.logger.log('get all devis request', 'DevisController');
    const language = req.language || 'en';
    const devis: Quote[] = await this.devisService.getAllDevis();
    return devis.map((d) => new QuoteListDto(d, language));
  }

  /* ──────────────── Admin CRUD ──────────────── */

  @Post('admin')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new quote (admin only)' })
  @ApiResponse({ status: 201, description: 'Quote created' })
  async createQuote(@Body() body: CreateQuoteDto): Promise<Quote> {
    return this.devisService.createQuote(body as any);
  }

  @Patch('admin/:id')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update an existing quote (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Quote updated' })
  async updateQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateQuoteDto,
  ): Promise<Quote> {
    return this.devisService.updateQuote(id, body as any);
  }

  @Delete('admin/:id')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete a quote (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ description: 'Quote deleted' })
  async deleteQuote(@Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: boolean }> {
    await this.devisService.deleteQuote(id);
    return { deleted: true };
  }
}
