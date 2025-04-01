import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GraphGateway } from './graph/graph.gateway';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, GraphGateway],
})
export class AppModule {}
