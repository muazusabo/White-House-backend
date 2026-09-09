import { IsNotEmpty, IsString, Length } from 'class-validator';

export class TrackOrderDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 30)
  orderNumber: string;

  @IsNotEmpty()
  @IsString()
  @Length(7, 30)
  phone: string;
}
