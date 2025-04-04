import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import * as dotenv from 'dotenv';
import { WebSocketCookieAdapter } from './utils/websocket-cookie.adapter';

dotenv.config();
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Use our custom WebSocketCookieAdapter
  app.useWebSocketAdapter(new WebSocketCookieAdapter(app));

  // Enable CORS for development
  app.enableCors({
    origin: 'https://nodegrade.haski.app',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 5000);
  console.log(
    `NestJS server running on port ${process.env.PORT ?? 5000} with CORS enabled`,
  );
}
bootstrap();
