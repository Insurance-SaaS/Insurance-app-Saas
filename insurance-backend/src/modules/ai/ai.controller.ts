import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AuthenticatedUser } from 'src/auth/ownership';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';
import { BusinessException } from 'src/shared/exceptions/business.exception';
import { AiOpenAIService } from './ai-openai.service';
import { fieldValue, readMultipart } from 'src/shared/uploads/multipart-reader';
import { ChatRequestDto, MAX_MESSAGE_LENGTH, SESSION_ID_PATTERN } from './dtos/chat.dto';
import { LlmErrorType } from './openai-client.service';

/** HTTP status for each kind of model failure. */
const LLM_ERROR_STATUS: Record<LlmErrorType, number> = {
  AUTH_ERROR: HttpStatus.SERVICE_UNAVAILABLE, // our credentials, not the caller's
  RATE_LIMIT_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,
  QUOTA_EXCEEDED: HttpStatus.SERVICE_UNAVAILABLE,
  MODEL_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  TIMEOUT_ERROR: HttpStatus.GATEWAY_TIMEOUT,
  NETWORK_ERROR: HttpStatus.BAD_GATEWAY,
  UNKNOWN_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

const ANALYSIS_TYPES = ['accident', 'property_damage', 'vehicle_inspection', 'general'];
const MAX_IMAGES_PER_REQUEST = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Reads the text fields and the photos of an assistant request. */
async function readImageUpload(request: unknown) {
  const { fields, files } = await readMultipart(request, {
    fileFields: ['images'],
    maxFiles: MAX_IMAGES_PER_REQUEST,
    maxFileBytes: MAX_IMAGE_BYTES,
    accept: 'images',
  });
  return {
    message: fieldValue(fields, 'message'),
    sessionId: fieldValue(fields, 'sessionId'),
    analysisType: fieldValue(fields, 'analysisType'),
    images: files.map((file) => ({
      filename: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      base64: file.buffer.toString('base64'),
    })),
  };
}
const LANGUAGES = ['fr', 'en', 'ar'] as const;

@ApiTags('AI Assistant - Insurance Claims & Quotes')
@ApiBearerAuth()
@RequiresPlugin('@insurance/ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiOpenAIService) {}

  /** A turn result as an HTTP response, or the matching HTTP error. */
  private toResponse(result: any, message: string, imagesInRequest = 0) {
    if (result.error) {
      // The error type is the response's "code"; the session can be retried.
      throw new BusinessException(
        result.response,
        LLM_ERROR_STATUS[result.error.type as LlmErrorType] ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result.error.type,
        { sessionId: result.sessionId },
      );
    }
    const { response, ...rest } = result;
    return {
      ...rest,
      message,
      response,
      ...(result.imageAnalysis !== undefined
        ? {
            imagesAnalyzed: imagesInRequest,
            hasImages: result.imageAnalysis.length > 0,
            totalImagesInConversation: result.imageAnalysis.length,
          }
        : {}),
    };
  }

  private sessionIdParam(sessionId: string): string {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new BadRequestException('Invalid sessionId');
    }
    return sessionId;
  }

  @Post('chat')
  @ApiOperation({
    summary: 'Send a message to the assistant',
    description:
      'Continues the conversation named by sessionId, or starts a new one. The answer carries ' +
      'the sessionId to use next, the data collected so far and what is still missing. ' +
      'A conversation belongs to the user who started it. Languages: French, English, Arabic.',
  })
  async chat(@Body() body: ChatRequestDto, @CurrentUser() user: AuthenticatedUser) {
    const sessionId = body.sessionId ?? this.aiService.newSessionId();
    const result = await this.aiService.processMessage(sessionId, body.message, user.id);
    return this.toResponse(result, body.message);
  }

  @Post('chat/with-images')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Send a message with photos',
    description:
      `Multipart form: "message" (optional), "sessionId" (optional), "images" (up to ` +
      `${MAX_IMAGES_PER_REQUEST} JPG, PNG or WEBP files of at most 10 MB each). ` +
      'The photos are analysed and attached to the claim when it is declared.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', maxLength: MAX_MESSAGE_LENGTH },
        sessionId: { type: 'string' },
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  async chatWithImages(@Req() request: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    const upload = await readImageUpload(request);
    const { images } = upload;

    const typed = (upload.message ?? '').trim();
    if (!typed && images.length === 0) {
      throw new BadRequestException('Please provide either a message or images (or both)');
    }
    if (typed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`message must be at most ${MAX_MESSAGE_LENGTH} characters`);
    }
    const sessionId = upload.sessionId?.trim()
      ? this.sessionIdParam(upload.sessionId.trim())
      : this.aiService.newSessionId();
    const message = typed || `[${images.length} photo(s) uploaded]`;

    const result = images.length
      ? await this.aiService.processMessageWithImages(sessionId, message, images, user.id)
      : await this.aiService.processMessage(sessionId, message, user.id);
    return this.toResponse(result, message, images.length);
  }

  @Post('analyze-image')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Analyse photos without a conversation',
    description:
      `Multipart form: "images" (1 to ${MAX_IMAGES_PER_REQUEST}) and optional "analysisType" ` +
      `(${ANALYSIS_TYPES.join(', ')}). Nothing is stored.`,
  })
  async analyzeImages(@Req() request: FastifyRequest) {
    const upload = await readImageUpload(request);
    const { images } = upload;
    if (images.length === 0) {
      throw new BadRequestException('No images provided. Please attach at least one image.');
    }
    const analysisType = upload.analysisType?.trim() || 'general';
    if (!ANALYSIS_TYPES.includes(analysisType)) {
      throw new BadRequestException(
        `Invalid analysis type. Must be one of: ${ANALYSIS_TYPES.join(', ')}`,
      );
    }

    const results = await this.aiService.analyzeImages(images, analysisType);

    const failed = results.find((result) => result.error);
    if (failed) {
      throw new BusinessException(
        failed.analysis,
        LLM_ERROR_STATUS[failed.error as LlmErrorType] ?? HttpStatus.INTERNAL_SERVER_ERROR,
        failed.error,
        { analysisType, imagesAnalyzed: images.length },
      );
    }
    return { analysisType, imagesAnalyzed: images.length, results };
  }

  @Get('context/:sessionId')
  @ApiOperation({ summary: 'State of one of your conversations' })
  @ApiParam({ name: 'sessionId' })
  async getContext(@Param('sessionId') sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    const history = await this.aiService.getConversationHistory(
      this.sessionIdParam(sessionId),
      user.id,
    );
    if (!history) {
      throw new NotFoundException('Session not found');
    }

    const values = history.values;
    const totalFields = this.aiService.totalFieldsOf(values);
    return {
      sessionId,
      language: values.language || 'fr',
      conversationType: values.conversationType,
      conversationGoal: values.conversationGoal,
      extractedData: values.extractedData,
      missingInformation: values.missingInfo || [],
      currentFieldIndex: values.currentFieldIndex || 0,
      totalFields,
      progress: this.aiService.calculateProgress(values),
      messageCount: values.messages?.length || 0,
      isComplete: values.isComplete || false,
      needsHumanReview: values.needsHumanReview || false,
      fraudScore: values.fraudScore || 0,
      hasImages: values.imageAnalysis?.length > 0 || false,
      validationResults: values.validationResults || {},
    };
  }

  @Delete('context/:sessionId')
  @ApiOperation({ summary: 'Forget one of your conversations, including its photos' })
  @ApiParam({ name: 'sessionId' })
  async resetContext(@Param('sessionId') sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.aiService.resetConversation(this.sessionIdParam(sessionId), user.id);
    return { success: true, message: 'Session reset successfully', sessionId };
  }

  @Get('languages')
  @ApiOperation({ summary: 'Languages the assistant speaks for this tenant' })
  getSupportedLanguages() {
    const names = { fr: ['Français', '🇫🇷'], en: ['English', '🇬🇧'], ar: ['العربية', '🇸🇦'] };
    const codes = this.aiService.getSupportedLanguages();
    return {
      languages: codes.map((code) => ({ code, name: names[code][0], flag: names[code][1] })),
      codes,
    };
  }

  private describeFields(fields: string[]) {
    const translations: Record<string, Record<string, string>> = {};
    for (const field of fields) {
      translations[field] = Object.fromEntries(
        LANGUAGES.map((lang) => [lang, this.aiService.getFieldTranslation(field, lang as any)]),
      );
    }
    return { fields, totalFields: fields.length, translations };
  }

  // 'fields/sinistre' is the former name, kept for the mobile app.
  @Get(['fields/claim', 'fields/sinistre'])
  @ApiOperation({ summary: 'Fields collected for a claim, in order, with translations' })
  getSinistreFields() {
    return this.describeFields(this.aiService.getRequiredFieldsForSinistre());
  }

  @Get('fields/quotes/:conversationType')
  @ApiOperation({ summary: 'Fields collected for a quote request, with translations' })
  @ApiParam({ name: 'conversationType', example: 'devis_auto' })
  getDevisFields(@Param('conversationType') conversationType: string) {
    return this.describeFields(this.aiService.getRequiredFieldsForDevis(conversationType));
  }

  @Get('suggestions/:sessionId')
  @ApiOperation({ summary: 'Suggested next messages for one of your conversations' })
  @ApiParam({ name: 'sessionId' })
  async getSmartSuggestions(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const suggestions = await this.aiService.getSmartSuggestions(
      this.sessionIdParam(sessionId),
      user.id,
    );
    return { sessionId, suggestions };
  }

  @Get('graph')
  @ApiOperation({ summary: 'The conversation flow as a Mermaid diagram' })
  async visualizeGraph() {
    return { graph: await this.aiService.visualizeGraph() };
  }

  @Get('usage/:sessionId')
  @ApiOperation({ summary: 'Model tokens used by one of your conversations' })
  @ApiParam({ name: 'sessionId' })
  async getTokenUsage(@Param('sessionId') sessionId: string, @CurrentUser() user: AuthenticatedUser) {
    const usage = await this.aiService.getSessionTokenUsage(this.sessionIdParam(sessionId), user.id);
    if (!usage) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'No usage data found for this session',
        sessionId,
      });
    }
    return { sessionId, ...usage };
  }
}
