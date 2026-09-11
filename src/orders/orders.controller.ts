import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, unlink } from 'fs';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TrackOrderDto } from './dto/track-order.dto';
import { Throttle } from '@nestjs/throttler';

const PAYMENT_PROOF_DIRECTORY = join(process.cwd(), 'uploads', 'payment-proofs');
const execFileAsync = promisify(execFile);

type UploadedPaymentProof = { filename: string };

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Post(':id/payment-proof')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('paymentProof', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          mkdirSync(PAYMENT_PROOF_DIRECTORY, { recursive: true });
          callback(null, PAYMENT_PROOF_DIRECTORY);
        },
        filename: (_request, file, callback) => {
          callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        callback(null, file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf');
      },
    }),
  )
  uploadPaymentProof(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: UploadedPaymentProof,
  ) {
    if (!file) throw new BadRequestException('Attach an image or PDF payment proof');
    return this.validateAndAttachPaymentProof(
      id,
      file,
    );
  }

  private async validateAndAttachPaymentProof(id: number, file: UploadedPaymentProof) {
    const filePath = join(PAYMENT_PROOF_DIRECTORY, file.filename);
    try {
      const contents = await readFile(filePath);
      if (!this.hasValidSignature(contents)) {
        throw new BadRequestException('The payment proof file contents are invalid');
      }

      await this.scanForViruses(filePath);
      return this.ordersService.attachPaymentProof(id, `/uploads/payment-proofs/${file.filename}`);
    } catch (error) {
      await promisify(unlink)(filePath).catch(() => undefined);
      throw error;
    }
  }

  private hasValidSignature(contents: Buffer) {
    const isJpeg = contents.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const isPng = contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = contents.subarray(0, 4).toString() === 'RIFF' && contents.subarray(8, 12).toString() === 'WEBP';
    const isGif = contents.subarray(0, 3).toString() === 'GIF';
    const isBmp = contents.subarray(0, 2).toString() === 'BM';
    const isTiff = contents.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]))
      || contents.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
    const isAvif = contents.subarray(4, 12).toString() === 'ftypavif'
      || contents.subarray(4, 12).toString() === 'ftypavis';
    const isPdf = contents.subarray(0, 5).toString() === '%PDF-';
    return isJpeg || isPng || isWebp || isGif || isBmp || isTiff || isAvif || isPdf;
  }

  private async scanForViruses(filePath: string) {
    const scannerPath = process.env.CLAMAV_PATH;
    if (!scannerPath) {
      if (process.env.CLAMAV_REQUIRED === 'true') {
        throw new BadRequestException('Payment proof scanning is not available');
      }
      return;
    }

    try {
      await execFileAsync(scannerPath, ['--no-summary', filePath], { timeout: 30_000 });
    } catch {
      throw new BadRequestException('Payment proof failed the security scan');
    }
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Post('track')
  track(@Body() dto: TrackOrderDto) {
    return this.ordersService.track(dto);
  }
}
