import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { Shop } from './entities/shop.entity';
import { ShopDeploymentService } from './shop-deployment.service';
import { ShopRepository } from './shop.repository';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

@Module({
  imports: [TypeOrmModule.forFeature([Shop]), KubernetesModule],
  controllers: [ShopsController],
  providers: [ShopsService, ShopRepository, ShopDeploymentService],
  exports: [ShopsService],
})
export class ShopsModule {}
