import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class OrderItemInputDto {
  @Type(() => Number)
  @IsInt()
  productId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateOrderDto {
  @IsNotEmpty()
  @IsString()
  @Length(2, 80)
  customerName: string;

  @IsNotEmpty()
  @IsString()
  @Length(1, 40)
  lodgeNumber: string;

  @IsNotEmpty()
  @IsString()
  @Length(7, 30)
  @Matches(/^[+\d][\d\s().-]+$/, { message: 'Enter a valid phone number' })
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsDateString()
  collectionDate: string;

  @IsNotEmpty()
  @IsString()
  @Length(1, 30)
  collectionTime: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Cart cannot be empty' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}
