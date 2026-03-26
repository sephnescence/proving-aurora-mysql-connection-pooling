import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  // Both apps use fixed ports — they won't run simultaneously, so a shared PORT env var isn't useful
  await app.listen(3000)
}

bootstrap()
