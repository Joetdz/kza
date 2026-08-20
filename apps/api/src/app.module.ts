import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ProductsModule } from './products/products.module';
import { MovementsModule } from './movements/movements.module';
import { SalesModule } from './sales/sales.module';
import { ExpensesModule } from './expenses/expenses.module';
import { GoalsModule } from './goals/goals.module';
import { UploadModule } from './upload/upload.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { AdminModule } from './admin/admin.module';
import { BusinessAiModule } from './business-ai/business-ai.module';
import { StoreModule } from './store/store.module';
import { CategoriesModule } from './categories/categories.module';
import { BusinessModule } from './business/business.module';
import { LogisticsModule } from './logistics/logistics.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ProductsModule,
    MovementsModule,
    SalesModule,
    ExpensesModule,
    GoalsModule,
    UploadModule,
    WhatsAppModule,
    AdminModule,
    BusinessAiModule,
    StoreModule,
    CategoriesModule,
    BusinessModule,
    LogisticsModule,
    PushModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
