import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '5432')),
        username: config.get<string>('DB_USERNAME', 'shophub'),
        password: config.get<string>('DB_PASSWORD', 'shophub'),
        database: config.get<string>('DB_NAME', 'shophub'),
        autoLoadEntities: true,
        // The ShopHub database is provisioned by the CNPG operator when the
        // platform is deployed, so the schema is created from the entities
        // instead of migrations.
        synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}
