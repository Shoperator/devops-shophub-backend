import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// Type-only: `emitDecoratorMetadata` would otherwise emit a runtime reference
// to an interface that does not exist at runtime.
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CreateShopDto } from './dto/create-shop.dto';
import { ShopResponseDto } from './dto/shop-response.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopsService } from './shops.service';

/** Every route works on the shops of the account the token belongs to. */
@Controller('shops')
@UseGuards(JwtAuthGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShopDto,
  ): Promise<ShopResponseDto> {
    const shop = await this.shopsService.create(user.id, dto);
    return ShopResponseDto.fromEntity(shop);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShopResponseDto[]> {
    const shops = await this.shopsService.findAllByOwner(user.id);
    return shops.map((shop) => ShopResponseDto.fromEntity(shop));
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShopResponseDto> {
    const shop = await this.shopsService.getOwned(user.id, id);
    return ShopResponseDto.fromEntity(shop);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopDto,
  ): Promise<ShopResponseDto> {
    const shop = await this.shopsService.update(user.id, id, dto);
    return ShopResponseDto.fromEntity(shop);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.shopsService.remove(user.id, id);
  }
}
