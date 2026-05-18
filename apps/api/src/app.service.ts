import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      ok: true,
      service: 'taller-api',
      at: new Date().toISOString(),
    };
  }
}
