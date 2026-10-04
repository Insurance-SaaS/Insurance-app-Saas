import { ApiProperty } from '@nestjs/swagger';
import { Product } from '../entities/product.entity';

export class ProductDto {
  constructor(entity: Product, language: 'en' | 'fr' | 'ar' = 'en') {
    this.id = entity.id;
    this.type = entity.getType(language);
  }
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Assurance Auto' })
  type: string;
}
