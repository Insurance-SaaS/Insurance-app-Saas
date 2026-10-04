import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query string of the list endpoints: `?page=2&limit=20`. */
export class PageQueryDto {
  @ApiPropertyOptional({ description: 'Page number, starting at 1', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  // Read by the language interceptor; declared so the strict validation accepts them.
  @ApiPropertyOptional({ description: 'Response language', enum: ['en', 'fr', 'ar'] })
  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsString()
  language?: string;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
