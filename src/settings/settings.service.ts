import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 1 },
    });
    if (settings) return settings;

    // Create defaults if none exist yet
    return this.prisma.restaurantSettings.create({
      data: { id: 1, restaurantName: 'White House Eatry' },
    });
  }

  async update(dto: UpdateSettingsDto) {
    await this.get();
    return this.prisma.restaurantSettings.update({
      where: { id: 1 },
      data: dto,
    });
  }
}
