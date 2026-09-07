import { IsEnum, IsString, Length, Matches } from 'class-validator';
import { ShopAvailability, ShopDatabase } from '../entities/shop.entity';
import { SHOP_NAME_MESSAGE, SHOP_NAME_PATTERN } from './shop-name';
import {
  WALLET_ADDRESS_MESSAGE,
  WALLET_ADDRESS_PATTERN,
} from './wallet-address';

/** What the owner fills in to have a shop site deployed. */
export class CreateShopDto {
  @IsString()
  @Length(3, 64)
  @Matches(SHOP_NAME_PATTERN, { message: SHOP_NAME_MESSAGE })
  name: string;

  @IsEnum(ShopAvailability)
  availability: ShopAvailability;

  @IsString()
  @Matches(WALLET_ADDRESS_PATTERN, { message: WALLET_ADDRESS_MESSAGE })
  walletAddress: string;

  @IsEnum(ShopDatabase)
  database: ShopDatabase;
}
