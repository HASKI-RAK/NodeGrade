import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import XAPI from '@xapi/xapi';

// XAPI
export const xAPI = new XAPI({
  endpoint: process.env.XAPI_ENDPOINT ?? '',
  auth: XAPI.toBasicAuth(
    process.env.XAPI_USERNAME ?? '',
    process.env.XAPI_PASSWORD ?? '',
  ),
  version: '1.0.3',
});

@Injectable()
export class XapiService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Add any initialization logic if needed
  }

  async onModuleDestroy() {
    // Add any cleanup logic if needed
  }

  // We can access the xAPI instance through this service
  getXapi() {
    return xAPI;
  }
}
