import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from './entities/shop.entity';
import { ShopDeploymentService } from './shop-deployment.service';
import { ShopRepository } from './shop.repository';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

@Module({
  imports: [TypeOrmModule.forFeature([Shop])],
  controllers: [ShopsController],
  providers: [ShopsService, ShopRepository, ShopDeploymentService],
  exports: [ShopsService],
})
export class ShopsModule {}
