import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Controller('partner-portal')
export class PartnerPortalController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get(':token')
  async getPartnerOrders(@Param('token') token: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { token },
      include: {
        location: {
          include: { stocks: { include: { product: true } } },
        },
        orders: {
          include: {
            items: { include: { product: true } },
            location: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return partner;
  }

  @Public()
  @Patch(':token/orders/:orderId')
  async updateOrderStatus(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
    @Body() body: { status: string; deliveryPersonName?: string },
  ) {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { token } });
    if (!partner) return null;

    const order = await this.prisma.manualOrder.findFirst({
      where: { id: orderId, partnerId: partner.id },
      include: { items: true },
    });
    if (!order) return null;

    const updated = await this.prisma.manualOrder.update({
      where: { id: orderId },
      data: {
        status: body.status,
        ...(body.deliveryPersonName ? { deliveryPersonName: body.deliveryPersonName } : {}),
      },
    });

    if (body.status === 'delivered' && order.locationId) {
      for (const item of order.items) {
        await this.prisma.locationStock.updateMany({
          where: { locationId: order.locationId, productId: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }

    return updated;
  }
}
