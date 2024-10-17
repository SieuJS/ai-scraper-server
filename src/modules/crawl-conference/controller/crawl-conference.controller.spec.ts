import { Test, TestingModule } from '@nestjs/testing';
import { CrawlConferenceController } from './crawl-conference.controller';

describe('CrawlConferenceController', () => {
  let controller: CrawlConferenceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CrawlConferenceController],
    }).compile();

    controller = module.get<CrawlConferenceController>(CrawlConferenceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
