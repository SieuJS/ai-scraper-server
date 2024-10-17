import { Module } from '@nestjs/common';
import { CrawlConferenceController } from './controller/index';
import { CrawlConferenceService,BrowserService } from './service/index';
import { CommonModule } from '../common';


@Module({
  imports: [
    CommonModule,
  ],
  controllers: [CrawlConferenceController],
  providers: [CrawlConferenceService, BrowserService],
  exports: []
})
export class CrawlConferenceModule {}
