import { Shop, ShopAvailability, ShopDatabase } from '../entities/shop.entity';

/** The public shape of a shop; the owner id stays inside the service. */
export class ShopResponseDto {
  id: string;
  name: string;
  /** Name of the shop's resources in the cluster. */
  slug: string;
  availability: ShopAvailability;
  walletAddress: string;
  database: ShopDatabase;
  /** Null while the site is still being deployed. */
  url: string | null;
  createdAt: Date;

  static fromEntity(shop: Shop): ShopResponseDto {
    return {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      availability: shop.availability,
      walletAddress: shop.walletAddress,
      database: shop.database,
      url: shop.url,
      createdAt: shop.createdAt,
    };
  }
}
