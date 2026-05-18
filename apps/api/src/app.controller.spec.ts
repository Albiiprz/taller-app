import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return service health payload', () => {
      const res = appController.health();
      expect(res.ok).toBe(true);
      expect(res.service).toBe('taller-api');
      expect(typeof res.at).toBe('string');
    });
  });
});
