import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TranslationService } from './translation.service';
import { TranslateRequestDto } from './dtos/translate-request.dto';
import { TranslateResponseDto, SupportedLanguagesResponseDto } from './dtos/translate-response.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { NoTenant } from 'src/core/tenant/decorators/no-tenant.decorator';

@ApiTags('Translation')
@Controller('translation')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post('translate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Translate text',
    description:
      'Translates text from source language to target language. Source language can be auto-detected.',
  })
  @ApiResponse({
    status: 200,
    description: 'Translation successful',
    type: TranslateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request',
  })
  @ApiResponse({
    status: 500,
    description: 'Translation service error',
  })
  async translate(@Body() translateDto: TranslateRequestDto): Promise<TranslateResponseDto> {
    return await this.translationService.translate(translateDto);
  }

  @Public()
  @NoTenant()
  @Get('languages')
  @ApiOperation({
    summary: 'Get supported languages',
    description: 'Returns a list of all supported language codes and their names',
  })
  @ApiResponse({
    status: 200,
    description: 'List of supported languages',
    type: SupportedLanguagesResponseDto,
  })
  async getSupportedLanguages(): Promise<SupportedLanguagesResponseDto> {
    return await this.translationService.getSupportedLanguages();
  }

  @Public()
  @NoTenant()
  @Get('health')
  @ApiOperation({
    summary: 'Check translation service health',
    description: 'Returns the health status of the translation service',
  })
  @ApiResponse({
    status: 200,
    description: 'Health status',
  })
  async health(): Promise<{ healthy: boolean }> {
    const healthy = await this.translationService.isHealthy();
    return { healthy };
  }
}
