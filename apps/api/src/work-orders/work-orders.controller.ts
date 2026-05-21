import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateWorkOrderNoteDto } from './dto/create-work-order-note.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';
import { UpsertWorkOrderChecklistDto } from './dto/upsert-work-order-checklist.dto';
import { WorkOrderTimeActionDto } from './dto/work-order-time-action.dto';
import { ConsumeWorkOrderMaterialDto } from './dto/consume-work-order-material.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly service: WorkOrdersService) {}

  private actorFromReq(req: Request): { actorRole?: string; actorName?: string } {
    const user = (req as Request & { user?: { role?: string; name?: string } }).user;
    return {
      actorRole: user?.role,
      actorName: user?.name,
    };
  }

  @Get()
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/audit')
  getAudit(@Param('id') id: string) {
    return this.service.getAudit(id);
  }

  @Get(':id/notes')
  getNotes(@Param('id') id: string) {
    return this.service.getNotes(id);
  }

  @Post(':id/notes')
  createNote(
    @Param('id') id: string,
    @Body() dto: CreateWorkOrderNoteDto,
    @Req() req: Request,
  ) {
    return this.service.createNote(id, { ...dto, ...this.actorFromReq(req) });
  }

  @Get(':id/checklist')
  getChecklist(@Param('id') id: string) {
    return this.service.getChecklist(id);
  }

  @Patch(':id/checklist')
  upsertChecklist(
    @Param('id') id: string,
    @Body() dto: UpsertWorkOrderChecklistDto,
    @Req() req: Request,
  ) {
    return this.service.upsertChecklist(id, { ...dto, ...this.actorFromReq(req) });
  }

  @Get(':id/time')
  getTime(@Param('id') id: string) {
    return this.service.getTime(id);
  }

  @Get(':id/time/sessions')
  getTimeSessions(@Param('id') id: string) {
    return this.service.getTimeSessions(id);
  }

  @Get('/inventory/products')
  listProducts() {
    return this.service.listProducts();
  }

  @Get('/inventory/products/by-barcode/:barcode')
  findProductByBarcode(@Param('barcode') barcode: string) {
    return this.service.findProductByBarcode(barcode);
  }

  @Post('/inventory/products')
  createProduct(@Body() dto: CreateProductDto, @Req() req: Request) {
    const actor = this.actorFromReq(req);
    return this.service.createProduct(dto, actor.actorRole);
  }

  @Patch('/inventory/products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto, @Req() req: Request) {
    const actor = this.actorFromReq(req);
    return this.service.updateProduct(id, dto, actor.actorRole);
  }

  @Delete('/inventory/products/:id')
  deleteProduct(@Param('id') id: string, @Req() req: Request) {
    const actor = this.actorFromReq(req);
    return this.service.deleteProduct(id, actor.actorRole);
  }

  @Post('/inventory/products/:id/adjust')
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto, @Req() req: Request) {
    const actor = this.actorFromReq(req);
    return this.service.adjustStock(id, dto, actor.actorRole, actor.actorName);
  }

  @Get('/inventory/moves')
  listInventoryMoves(@Query('limit') limit?: string) {
    return this.service.listInventoryMoves(limit ? Number(limit) : undefined);
  }

  @Post(':id/time/start')
  startTime(
    @Param('id') id: string,
    @Body() dto: WorkOrderTimeActionDto,
    @Req() req: Request,
  ) {
    return this.service.startTime(id, { ...dto, ...this.actorFromReq(req) });
  }

  @Post(':id/time/stop')
  stopTime(
    @Param('id') id: string,
    @Body() dto: WorkOrderTimeActionDto,
    @Req() req: Request,
  ) {
    return this.service.stopTime(id, { ...dto, ...this.actorFromReq(req) });
  }

  @Post(':id/consume')
  consumeMaterial(
    @Param('id') id: string,
    @Body() dto: ConsumeWorkOrderMaterialDto,
    @Req() req: Request,
  ) {
    return this.service.consumeMaterial(id, { ...dto, ...this.actorFromReq(req) });
  }

  @Post()
  create(@Body() dto: CreateWorkOrderDto, @Req() req: Request) {
    return this.service.create({ ...dto, ...this.actorFromReq(req) });
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderStatusDto,
    @Req() req: Request,
  ) {
    return this.service.updateStatus(id, { ...dto, ...this.actorFromReq(req) });
  }
}
