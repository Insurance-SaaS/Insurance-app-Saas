import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  IsIn,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'isDzdCurrency', async: false })
class IsDzdCurrencyConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    // Always true if you only allow DZD in logic (no currency field)
    return typeof value === 'number' && value >= 30000;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Budget must be a number in Algerian Dinar (DZD)';
  }
}

export class GetQuotesDto {
  @ApiProperty({ description: 'Type of the product', example: 'auto' })
  @IsString()
  productType: string;

  @ApiProperty({ description: 'Age of the customer, must be at least 19', example: 25 })
  @IsNumber()
  @Min(19)
  age: number;

  @ApiProperty({ description: 'Postal code', example: '26000' })
  @IsString()
  codePostal: string;

  @ApiProperty({
    description: 'Budget in Algerian Dinar (DZD)',
    example: 30000,
  })
  @IsNumber()
  @Min(30000)
  @Validate(IsDzdCurrencyConstraint)
  budget: number;

  @ApiPropertyOptional({ description: 'Vehicle type', example: 'SUV' })
  @IsString()
  @IsOptional()
  vehicleType?: string;

  @ApiPropertyOptional({
    description: 'Language for response translation',
    example: 'ar',
    enum: ['en', 'fr', 'ar'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['en', 'fr', 'ar'], {
    message: 'Language must be one of: en, fr, ar',
  })
  lang?: string;
}
