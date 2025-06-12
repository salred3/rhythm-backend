import { IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MatrixValuesDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Business impact score' })
  @IsNumber()
  @Min(1)
  @Max(5)
  impact: number;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Implementation effort score' })
  @IsNumber()
  @Min(1)
  @Max(5)
  effort: number;

  @ApiProperty({ minimum: 1, maximum: 90, description: 'Timeline in days' })
  @IsNumber()
  @Min(1)
  @Max(90)
  timelineDays: number;

  @ApiProperty({ description: 'Lock matrix values from automatic updates' })
  @IsBoolean()
  isLocked: boolean;
}
