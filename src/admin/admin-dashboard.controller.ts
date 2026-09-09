import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderStatusEnum } from '../common/enums/order-status.enum';

@UseGuards(JwtAuthGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getSummary() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalOrdersToday,
      pending,
      preparing,
      ready,
      completed,
      availableProducts,
      unavailableProducts,
      completedTodayAgg,
      topItems,
    ] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.order.count({ where: { status: OrderStatusEnum.PENDING } }),
      this.prisma.order.count({ where: { status: OrderStatusEnum.PREPARING } }),
      this.prisma.order.count({ where: { status: OrderStatusEnum.READY } }),
      this.prisma.order.count({ where: { status: OrderStatusEnum.COMPLETED } }),
      this.prisma.product.count({ where: { available: true } }),
      this.prisma.product.count({ where: { available: false } }),
      this.prisma.order.aggregate({
        where: {
          status: OrderStatusEnum.COMPLETED,
          createdAt: { gte: startOfToday },
        },
        _sum: { total: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId', 'name'],
        where: {
          order: {
            createdAt: { gte: startOfToday },
            status: { not: OrderStatusEnum.CANCELLED },
          },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      totalOrdersToday,
      pendingOrders: pending,
      preparingOrders: preparing,
      readyOrders: ready,
      completedOrders: completed,
      totalSalesToday: completedTodayAgg._sum.total || 0,
      availableProducts,
      unavailableProducts,
      topItems,
    };
  }
}
