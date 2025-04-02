import { Module } from '@nestjs/common';
import { GraphModule } from '../graphgateway/graph.module';

@Module({
  imports: [GraphModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
