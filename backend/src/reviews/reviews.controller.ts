import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user, dto);
  }

  @Public()
  @Get()
  findForTarget(@Query() query: ListReviewsDto) {
    return this.reviewsService.findForTarget(query);
  }

  @Get('eligibility/:orderId')
  getEligibility(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.reviewsService.getEligibility(user, orderId);
  }
}
