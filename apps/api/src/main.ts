import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';

// Prevent whatsapp-web.js internal unhandled rejections from crashing the server
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message ?? String(reason);
  // Only suppress known wwebjs page-evaluate errors
  if (msg === 't' || msg?.includes('Navigating frame was detached') || msg?.includes('Session closed')) return;
  console.error('Unhandled rejection:', reason);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Servir les fichiers uploadés (photos produits)
  // __dirname = apps/api/src en mode ts-node → on remonte d'un niveau
  const uploadsDir = join(__dirname, '..', 'uploads');
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  });

  // CORS — autorise le frontend React
  app.enableCors({
    origin: process.env.FRONTEND_URL ??/^http:\/\/(localhost|127\.0\.0\.1|172\.16\.\d+\.\d+):\d+$/,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Validation globale des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Préfixe global de l'API
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
 
  console.log(`🚀 KZA API running on http://localhost:${port}/api`);
}
bootstrap();
