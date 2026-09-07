import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ShopAvailability } from '../entities/shop.entity';
import {
  WALLET_ADDRESS_MESSAGE,
  WALLET_ADDRESS_PATTERN,
} from './wallet-address';

/**
 * Reconfiguring a shop that is already deployed.
 *
 * Shop name is set once, when it is created, and database is set once, when it is created.
 */
export class UpdateShopDto {
  @IsOptional()
  @IsEnum(ShopAvailability)
  availability?: ShopAvailability;

  @IsOptional()
  @IsString()
  @Matches(WALLET_ADDRESS_PATTERN, { message: WALLET_ADDRESS_MESSAGE })
  walletAddress?: string;
}
