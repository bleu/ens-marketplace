import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Loaded explicitly before NestFactory.create rather than relying on
  // ConfigModule.forRoot's incidental env-loading side effect — PrismaService's
  // constructor (which reads process.env.DATABASE_URL directly) runs during provider
  // instantiation, and its ordering relative to ConfigModule's own init isn't guaranteed.
  const app = await NestFactory.create(AppModule);
  // apps/web (Next.js, a separate origin/port) calls this server directly from its own
  // API route (server-to-server, not from the browser) — CORS is enabled anyway since
  // local dev often hits this port directly for testing (curl, the verification steps in
  // docs/grails-migration.md).
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
