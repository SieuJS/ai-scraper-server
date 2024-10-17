import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CrawlConferenceService, BrowserService } from '../service/index';
import { string } from 'joi';


@Controller('crawl-conferences')
@ApiTags('crawl-conference')
export class CrawlConferenceController {
    public constructor(
        private readonly crawlConferenceService: CrawlConferenceService,
        private readonly browserService: BrowserService
    ) { }

    @Get(':link')
    @ApiOperation({ summary: 'Crawl conference by link' })
    @ApiParam({ name: 'link', required: true, type: String })
    @ApiResponse({ status: HttpStatus.OK, type: string })
    public async crawlConference(@Param('link') link: string): Promise<string> {
        await this.browserService.init();
        let bodyText = link
        bodyText = await this.crawlConferenceService.callForCrawlConference(this.browserService.browser, link)
        await this.browserService.close() ;
        this.crawlConferenceService.getOwner();
        return bodyText || "";
    }
}
