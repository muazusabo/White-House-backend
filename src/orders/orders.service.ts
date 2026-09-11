import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { OrderStatusEnum } from '../common/enums/order-status.enum';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  private normalizePhone(phone: string) {
    const digits = phone.replace(/[^\d]/g, '');
    return digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
  }

  /**
   * Generates a short, human-friendly, unique order number, e.g. ORD-4F2K9A.
   * Retries on the rare chance of a collision.
   */
  private async generateOrderNumber(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `ORD-${Date.now()
        .toString(36)
        .toUpperCase()
        .slice(-4)}${Math.random().toString(36).toUpperCase().slice(2, 5)}`;

      const exists = await this.prisma.order.findUnique({
        where: { orderNumber: candidate },
      });
      if (!exists) return candidate;
    }
    throw new BadRequestException('Could not generate a unique order number, please retry');
  }

  /**
   * Core ordering logic. Never trusts prices or totals from the client.
   * Validates every product exists, is available, and has sufficient stock
   * (if stock tracking is enabled for that product), then calculates the
   * total on the server before creating the order.
   */
  async create(dto: CreateOrderDto) {
    const collectionDate = new Date(dto.collectionDate);
    if (isNaN(collectionDate.getTime())) {
      throw new BadRequestException('Invalid collection date');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (collectionDate < today) {
      throw new BadRequestException('Collection date cannot be in the past');
    }

    const productIds = dto.items.map((i) => i.productId);
    const uniqueProductIds = [...new Set(productIds)];
    if (uniqueProductIds.length !== productIds.length) {
      throw new BadRequestException('Each product may only appear once in an order');
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: uniqueProductIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate every requested product exists, is available, and has stock
    for (const item of dto.items) {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new BadRequestException(
          `Product with id ${item.productId} does not exist`,
        );
      }

      if (!product.available) {
        throw new BadRequestException(
          `"${product.name}" is currently unavailable. Please remove it from your cart.`,
        );
      }

      if (item.quantity < 1) {
        throw new BadRequestException(
          `Invalid quantity for "${product.name}"`,
        );
      }

      if (product.stock !== null && product.stock < item.quantity) {
        throw new BadRequestException(
          `Only ${product.stock} of "${product.name}" left in stock`,
        );
      }
    }

    // Server calculates the total. The frontend total is never trusted.
    const orderItemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const price = product.price;
      const subtotal = Number(price) * item.quantity;
      return {
        productId: product.id,
        name: product.name,
        price,
        quantity: item.quantity,
        subtotal,
      };
    });

    const total = orderItemsData.reduce((sum, i) => sum + Number(i.subtotal), 0);
    const orderNumber = await this.generateOrderNumber();

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          customerName: dto.customerName,
          lodgeNumber: dto.lodgeNumber,
          phone: this.normalizePhone(dto.phone),
          email: dto.email,
          note: dto.note,
          collectionDate,
          collectionTime: dto.collectionTime,
          total,
          status: OrderStatusEnum.PENDING,
          items: { create: orderItemsData },
        },
        include: { items: true },
      });

      // Decrement stock atomically so two simultaneous orders cannot oversell.
      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        if (product.stock !== null) {
          const updated = await tx.product.updateMany({
            where: { id: product.id, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (updated.count !== 1) {
            throw new BadRequestException(`"${product.name}" is no longer available in that quantity`);
          }
        }
      }

      return created;
    });

    return {
      ...order,
      id: Number(order.id),
    };
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async attachPaymentProof(id: number, paymentProofUrl: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    return this.prisma.order.update({
      where: { id },
      data: { paymentProofUrl },
      include: { items: true },
    });
  }

  async track(dto: TrackOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: dto.orderNumber },
      include: { items: true },
    });

    if (!order || order.phone !== this.normalizePhone(dto.phone)) {
      throw new NotFoundException(
        'No order found matching that order number and phone number',
      );
    }

    return order;
  }

  findAllForAdmin(status?: OrderStatusEnum, search?: string, from?: string, to?: string) {
    const createdAt: { gte?: Date; lt?: Date } = {};
    if (from) createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) {
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      createdAt.lt = end;
    }

    return this.prisma.order.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: number, status: OrderStatusEnum) {
    await this.findOne(id);
    return this.prisma.order.update({ where: { id }, data: { status } });
  }
}
