import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
