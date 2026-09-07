import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { Shop } from './entities/shop.entity';
import { ShopDeploymentService } from './shop-deployment.service';
import { ShopRepository } from './shop.repository';

/** Leaves room for the suffix inside the 40 characters the column allows. */
const SLUG_BASE_MAX_LENGTH = 32;

/**
 * Kubernetes object names are RFC 1123 labels, so the shop name is normalized
 * down to plain ASCII letters and everything else becomes the separator.
 * The random suffix keeps two shops with identical names apart.
 */
function toResourceName(name: string): string {
  const base = name
    // Splits "ć" into "c" plus a combining accent, and drops the accent, so the
    // resource name still reads like the shop it belongs to.
    .normalize('NFD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    // Only letters survive; digits and spaces become the separator.
    .replace(/[^a-z]+/g, '-')
    .slice(0, SLUG_BASE_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');

  // A name of nothing but digits leaves no letters behind, and a label may not
  // start with the suffix's dash.
  return `${base.length > 0 ? base : 'shop'}-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class ShopsService {
  constructor(
    private readonly shopRepository: ShopRepository,
    private readonly deployment: ShopDeploymentService,
  ) {}

  async create(ownerId: string, dto: CreateShopDto): Promise<Shop> {
    // Persisting in DB happens before request reaches cluster,
    // making sure that it's retryable instead of losing what the user asked for.
    const shop = await this.shopRepository.save(
      this.shopRepository.create({
        name: dto.name,
        slug: toResourceName(dto.name),
        availability: dto.availability,
        walletAddress: dto.walletAddress,
        database: dto.database,
        ownerId,
      }),
    );

    shop.url = await this.deployment.apply(shop);
    return this.shopRepository.save(shop);
  }

  findAllByOwner(ownerId: string): Promise<Shop[]> {
    return this.shopRepository.findAllByOwner(ownerId);
  }

  async getOwned(ownerId: string, id: string): Promise<Shop> {
    const shop = await this.shopRepository.findByIdAndOwner(id, ownerId);
    if (shop === null) {
      throw new NotFoundException(`Shop ${id} not found`);
    }
    return shop;
  }

  /**
   * Reconfigures a deployed shop. Its name is not among the settings: the
   * resource name and the URL are derived from it, and rebuilding those would
   * tear the running site down and move it to an address nobody has.
   */
  async update(ownerId: string, id: string, dto: UpdateShopDto): Promise<Shop> {
    const shop = await this.getOwned(ownerId, id);

    shop.availability = dto.availability ?? shop.availability;
    shop.walletAddress = dto.walletAddress ?? shop.walletAddress;

    shop.url = await this.deployment.apply(shop);
    return this.shopRepository.save(shop);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const shop = await this.getOwned(ownerId, id);

    // The cluster goes first: if the resources cannot be removed the shop stays
    // listed, rather than becoming unreachable by users.
    await this.deployment.remove(shop);
    await this.shopRepository.remove(shop);
  }
}
