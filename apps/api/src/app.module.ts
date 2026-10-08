import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
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
import { InvestorsModule } from './investors/investors.module';
import { FundraisingModule } from './fundraising/fundraising.module';

@Module({
  imports: [
    // DATABASE_URL/DIRECT_URL for the develop branch's database come from
    // preload-dev-env.js (run via `npm run start:dev:branch`), not from here — by the
    // time this runs, @prisma/client has already auto-loaded plain .env on its own, and
    // dotenv-style loaders never override an already-set process.env key. See that
    // file's header comment for the full explanation.
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
    InvestorsModule,
    FundraisingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Runs after JwtAuthGuard, so request.user (and its role) is already resolved.
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
