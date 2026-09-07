import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Shop } from './entities/shop.entity';

@Injectable()
export class ShopRepository {
  constructor(
    @InjectRepository(Shop)
    private readonly shops: Repository<Shop>,
  ) {}

  findAllByOwner(ownerId: string): Promise<Shop[]> {
    return this.shops.find({
      where: { ownerId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Ownership is part of the lookup rather than a check afterwards
   */
  findByIdAndOwner(id: string, ownerId: string): Promise<Shop | null> {
    return this.shops.findOne({ where: { id, ownerId } });
  }

  create(data: DeepPartial<Shop>): Shop {
    return this.shops.create(data);
  }

  save(shop: Shop): Promise<Shop> {
    return this.shops.save(shop);
  }

  remove(shop: Shop): Promise<Shop> {
    return this.shops.remove(shop);
  }
}
