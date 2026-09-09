import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminDashboardController } from './admin-dashboard.controller';

@Module({
  imports: [OrdersModule],
  controllers: [AdminOrdersController, AdminDashboardController],
})
export class AdminModule {}
