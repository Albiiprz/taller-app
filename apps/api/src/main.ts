import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      // Dev: allow local + Cloudflare quick tunnels.
      // Prod: should be restricted via reverse-proxy / dedicated domain.
      const isLocalhost =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin);
      const isTryCloudflare = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(
        origin,
      );

      if (isLocalhost || isTryCloudflare) return callback(null, true);
      return callback(new Error(`Origin no permitido: ${origin}`), false);
    },
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
