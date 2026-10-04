// src/modules/quotes/dtos/quote-list.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Quote } from '../entities/quote.entity';

export class QuoteListDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Assurance Auto Standard' })
  title: string;

  constructor(entity: Quote, language: 'en' | 'fr' | 'ar' = 'en') {
    this.id = entity.id;
    this.title = entity.getTitle(language);
  }
}
