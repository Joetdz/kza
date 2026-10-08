import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsEmail, IsNumber, IsOptional, IsIn, Min, Matches } from 'class-validator';

export class CreateInvestmentDto {
  @IsEmail()
  investorEmail: string;

  @IsString()
  @IsNotEmpty()
  investorName: string;

  @IsString()
  @IsOptional()
  investorPhone?: string;

  // Requis uniquement si c'est un nouvel investisseur (vérifié côté service) —
  // mot de passe initial de son compte portail, à lui communiquer toi-même (WhatsApp, téléphone...).
  @IsString()
  @IsOptional()
  investorPassword?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  // Montant fixe promis en retour et échéance — par défaut égaux au montant investi
  // / à l'échéance par défaut de la cagnotte, mais librement modifiables ici.
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  repaymentAmount?: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  repaymentDueDate?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  investedAt?: string;
}

export class UpdateInvestmentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  repaymentAmount?: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  repaymentDueDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  repaidAmount?: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  repaidAt?: string;

  @IsString()
  @IsIn(['pending', 'partially_repaid', 'repaid'])
  @IsOptional()
  status?: string;
}
