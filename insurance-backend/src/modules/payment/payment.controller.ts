import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RequiresPlugin } from 'src/core/plugin-registry/decorators/requires-plugin.decorator';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dtos/create-payment.dto';
import { UpdatePaymentStatusDto } from './dtos/update-payment-status.dto';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/modules/users/entities/user.entity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { assertOwnerOrAdmin, AuthenticatedUser } from 'src/auth/ownership';
import { PageQueryDto } from 'src/shared/dtos/page-query.dto';

@ApiTags('Payments')
@RequiresPlugin('@insurance/payment')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new payment' })
  async create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentTransaction> {
    // The payer is always the authenticated user, never a value from the body.
    return this.paymentService.create({ ...dto, userId: user.id });
  }

  @Get()
  @Roles(UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'List all payments (admin)' })
  async findAll(@Query() page: PageQueryDto): Promise<PaymentTransaction[]> {
    return this.paymentService.findAll(page);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiParam({ name: 'id', type: String })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentTransaction> {
    const payment = await this.paymentService.findById(id);
    assertOwnerOrAdmin(user, payment.userId, 'Payment');
    return payment;
  }

  @Get('reference/:ref')
  @ApiOperation({ summary: 'Get payment by reference number' })
  @ApiParam({ name: 'ref', type: String })
  async findByReference(
    @Param('ref') ref: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentTransaction> {
    const payment = await this.paymentService.findByReference(ref);
    assertOwnerOrAdmin(user, payment.userId, 'Payment');
    return payment;
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get payments for a user' })
  @ApiParam({ name: 'userId', type: String })
  async findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() page: PageQueryDto,
  ): Promise<PaymentTransaction[]> {
    assertOwnerOrAdmin(user, userId, 'Payments');
    return this.paymentService.findByUser(userId, page);
  }

  @Patch(':id/status')
  @Roles(UserRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update payment status (admin)' })
  @ApiParam({ name: 'id', type: String })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ): Promise<PaymentTransaction> {
    return this.paymentService.updateStatus(id, dto.status, dto.gatewayTransactionId);
  }
}
