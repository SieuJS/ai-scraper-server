import { Module } from '@nestjs/common';

import { CommonModule } from './common';
import { CrawlConferenceModule } from './crawl-conference/crawl-conference.module';
@Module({
    imports: [
        CommonModule,
        CrawlConferenceModule,
    ]
})
export class ApplicationModule {}
