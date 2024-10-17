import { Test, TestingModule } from '@nestjs/testing';
import { CrawlConferenceService } from './crawl-conference.service';

describe('CrawlConferenceService', () => {
  let service: CrawlConferenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrawlConferenceService],
    }).compile();

    service = module.get<CrawlConferenceService>(CrawlConferenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
